/*
  Copyright (C) 2014, Daishi Kato <daishi@axlight.com>
  All rights reserved.

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
  "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
  LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
  A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
  HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
  SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
  LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
  DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
  THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
  OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

/* global angular: false */
/* global breeze: false */

if (!Array.prototype.some) {
  Array.prototype.some = function(f) {
    if (this === null) throw new TypeError();
    var t = Object(this);
    var len = t.length || 0;
    if (typeof f != "function") throw new TypeError();
    for (var i = 0; i < len; i++) {
      if (i in t && f.call(this, t[i], i, t)) return true;
    }
    return false;
  };
}

angular.module('MainModule', ['ngRoute', 'ngResource', 'ngTouch', 'monospaced.elastic']).

config(['$routeProvider', function($routeProvider) {
  $routeProvider.
  when('/home', {
    templateUrl: 'static/partials/home.html',
    controller: 'HomeCtrl'
  }).
  when('/note', {
    templateUrl: 'static/partials/note.html',
    controller: 'NoteCtrl'
  }).
  when('/note/:guid', {
    templateUrl: 'static/partials/note.html',
    controller: 'NoteCtrl'
  }).
  otherwise({
    redirectTo: '/home'
  });
}]).

controller('HomeCtrl', ['$scope', '$window', 'Myself', 'BreezeDataContext', function($scope, $window, Myself, BreezeDataContext) {

  $scope.myself = {
    loading: true
  };
  Myself.then(function(myself) {
    $scope.myself = myself;
  });

  $scope.notes = BreezeDataContext.getMyNotes();

  $scope.delNote = function(note) {
    BreezeDataContext.delNote(note);
    $scope.notes.some(function(x, i) {
      if (x === note) {
        $scope.notes.splice(i, 1);
        return true;
      }
    });
  };

  $scope.login = function() {
    $window.location.pathname = '/login/facebook';
  };

  $scope.sync = function() {
    BreezeDataContext.syncNotes().then(function() {
      $scope.$apply(function() {
        $scope.notes = BreezeDataContext.getMyNotes();
      });
    });
  };

}]).

controller('NoteCtrl', ['$scope', '$routeParams', '$window', '$location', 'BreezeDataContext', function($scope, $routeParams, $window, $location, BreezeDataContext) {

  var guid = $routeParams.guid;

  if (guid) {
    $scope.note = BreezeDataContext.getNote(guid);
  } else {
    $scope.note = {};
  }

  $scope.save = function() {
    if ($scope.note && $scope.note.guid) {
      BreezeDataContext.modNote($scope.note);
    } else if ($scope.note && $scope.note.text) {
      $scope.note = BreezeDataContext.addNote({
        text: $scope.note.text
      });
      $location.path('/note/' + $scope.note.guid).replace();
    }
  };

  $scope.remove = function() {
    if ($window.confirm('Delete this note?')) {
      BreezeDataContext.delNote($scope.note);
      $location.path('/home');
    }
  };

}]).

factory('BreezeDataContext', ['$window', '$q', 'Myself', function($window, $q, Myself) {
  breeze.config.initializeAdapterInstance("modelLibrary", "backingStore", true);
  breeze.config.initializeAdapterInstance("dataService", "mongo", true);
  breeze.config.initializeAdapterInstance("ajax", "angular", true);

  var DT = breeze.DataType;

  var ownerType = new breeze.ComplexType({
    shortName: 'owner',
    dataProperties: {
      user_id: {
        dataType: DT.Int32
      }
    }
  });

  var BreezeModel = {
    initialize: function(metadataStore) {
      metadataStore.addEntityType({
        shortName: 'note',
        namespace: 'notes-app-sample',
        defaultResourceName: 'note',
        dataProperties: {
          _id: {
            dataType: DT.Int32
          },
          guid: {
            dataType: DT.Guid,
            isNullable: false,
            isPartOfKey: true
          },
          owner: {
            dataType: ownerType
          },
          scope: {
            dataType: ownerType,
            isScalar: false
          },
          last_modified: {
            dataType: DT.DateTime,
            isNullable: false
          },
          text: {
            dataType: DT.String,
            isNullable: false
          }
        }
      });
    }
  };

  var ds = new breeze.DataService({
    serviceName: 'breeze',
    hasServerMetadata: false
  });

  var manager = new breeze.EntityManager({
    dataService: ds
  });

  BreezeModel.initialize(manager.metadataStore);

  var savedEntities = $window.localStorage.getItem('breezeSavedEntities');
  if (savedEntities) {
    manager.importEntities(savedEntities);
  }

  function saveEntitiesLocally() {
    $window.localStorage.setItem('breezeSavedEntities', manager.exportEntities());
  }

  function ensureScope(entities, user_id) {
    angular.forEach(entities, function(entity) {
      var found = false;
      angular.forEach(entity.scope, function(x) {
        if (x.user_id === user_id) {
          found = true;
        }
      });
      if (!found) {
        entity.scope.push({
          user_id: user_id
        });
      }
    });
  }

  var noteType = manager.metadataStore.getEntityType('note');

  function syncNotes() {
    return Myself.then(function(myself) {
      if (myself) {
        var fetchEntitiesRemotely = function() {
          return breeze.EntityQuery.from('notes').where('owner.user_id', '==', myself._id).toType('note').using(breeze.MergeStrategy.OverwriteChanges).using(manager).execute(function(data) {
            // remove entities only in cache
            var results = data.results;
            angular.forEach(manager.getEntities(noteType), function(entity) {
              if ((entity.entityAspect.entityState.isUnchanged() || entity.entityAspect.entityState.isDeleted()) && results.indexOf(entity) === -1) {
                manager.detachEntity(entity);
              }
            });
            saveEntitiesLocally();
            return true;
          });
        };
        ensureScope(manager.getEntities(noteType), myself._id);
        return manager.saveChanges().then(function() {
          manager.acceptChanges(); //result doesn't include ids so manually accept
          return fetchEntitiesRemotely();
        }, function() { //error
          return fetchEntitiesRemotely();
        });
      }
    });
  }

  function getMyNotes() {
    var states = [breeze.EntityState.Added, breeze.EntityState.Modified, breeze.EntityState.Unchanged];
    return manager.getEntities(noteType, states);
  }

  function getNote(guid) {
    return manager.getEntityByKey('note', guid);
  }

  function addNote(obj) {
    obj.guid = DT.Guid.getNext();
    obj.last_modified = new Date();
    var ent = manager.createEntity(noteType, obj);
    manager.addEntity(ent);
    saveEntitiesLocally();
    return ent;
  }

  function modNote(ent) {
    ent.last_modified = new Date();
    saveEntitiesLocally();
  }

  function delNote(ent) {
    if (ent.entityAspect.entityState.isAdded()) {
      manager.detachEntity(ent);
    } else {
      ent.entityAspect.setDeleted();
    }
    saveEntitiesLocally();
  }

  return {
    syncNotes: syncNotes,
    getMyNotes: getMyNotes,
    getNote: getNote,
    addNote: addNote,
    modNote: modNote,
    delNote: delNote
  };

}]).

factory('User', ['$resource', function($resource) {
  return $resource('users/:id');
}]).

factory('Myself', ['$q', 'User', function($q, User) {
  var deferred = $q.defer();
  User.query({
    id: 'myself'
  }, function(data) {
    if (data.length === 1) {
      deferred.resolve(data[0]);
    } else {
      //not logged in
      deferred.resolve(null);
    }
  }, function() {
    //no network
    deferred.resolve(null);
  });
  return deferred.promise;
}]).

run(['$window', function($window) {
  var cache = $window.applicationCache;
  if (!cache) {
    return;
  }
  cache.addEventListener('updateready', function() {
    if ($window.confirm('Downloaded application updates. Apply them now?')) {
      if (cache.swapCache) {
        cache.swapCache();
      }
      $window.location.reload();
    }
  });
}]);
