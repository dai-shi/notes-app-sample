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

var path = require('path');
var http = require('http');
var express = require('express');
var MongoStore = require('connect-mongo')(express);
var cacheManifest = require('connect-cache-manifest');
var SCB = require('social-cms-backend');

var app = express();
app.configure(function() {
  app.use(express.logger());
  app.use(express.json());
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'jade');
  app.use(express.compress());
  app.use(express.urlencoded());
  app.use(express.cookieParser());
  app.use(cacheManifest({
    manifestPath: '/application.manifest',
    files: [{
      dir: __dirname + '/public',
      prefix: '/static/',
      ignore: function(x) {
        return (/(?:\.swp|~)$/).test(x);
      }
    }, {
      file: __dirname + '/views/index.jade',
      path: '/'
    }, {
      dir: __dirname + '/views/partials',
      prefix: '/static/partials/',
      ignore: function(x) {
        return (/(?:\.swp|~)$/).test(x);
      },
      replace: function(x) {
        return x.replace(/\.jade$/, '.html');
      }
    }],
    networks: ['*'],
    fallbacks: []
  }));
  app.use(SCB.middleware({
    mongodb_url: process.env.OPENSHIFT_MONGODB_DB_URL || process.env.MONGODB_URL || process.env.MONGOHQ_URL,
    session_middleware: express.session({
      secret: 'cb64d22439d1097f2297',
      store: new MongoStore({
        db: 'admin', //for openshift
        url: process.env.OPENSHIFT_MONGODB_DB_URL || process.env.MONGODB_URL || process.env.MONGOHQ_URL,
      }, function() {
        console.log('session db connection.');
      }),
      cookie: {
        path: '/',
        httpOnly: true,
        maxAge: 90 * 24 * 60 * 60 * 1000
      }
    }),
    passport_strategy: 'facebook',
    facebook_app_id: process.env.FACEBOOK_APP_ID,
    facebook_app_secret: process.env.FACEBOOK_APP_SECRET,
    auth_facebook: {
      login_success_path: '/'
    },
    breeze_mongo: true,
    routes: [{
      object_type: 'user',
      object_prefix: '/users'
    }, {
      object_type: 'note',
      object_prefix: '/breeze/notes'
    }, {
      object_prefix: '/breeze/SaveChanges'
    }]
  }));
  app.use(app.router);
  app.use(express.errorHandler());
});

app.get('/', function(req, res) {
  res.render('index');
});

app.get(new RegExp('^/static/(.+)\\.html$'), function(req, res) {
  var view_name = req.params[0];
  res.render(view_name);
});

app.use('/static', express.static(path.join(__dirname, 'public')));

http.createServer(app).listen(process.env.OPENSHIFT_NODEJS_PORT || process.env.PORT || 5000, process.env.OPENSHIFT_NODEJS_IP, function() {
  console.log('Express server listening.');
});
