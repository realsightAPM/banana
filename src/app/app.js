/**
 * main app level module
 */
define([
    'angular',
    'jquery',
    'underscore',

    'require',
    'cookies',
    'elasticjs',
    'solrjs',
    'bootstrap',
    'angular-sanitize',
    'angular-strap',
    'angular-dragdrop',
    'angular-route',
    'angular-material',
    'angular-smart-table',
    'extend-jquery',
    'angular-translate',
    'angular-translate-loader-static-files',
    'angular-sweetalert',
  'metisMenu',
  'slimscroll',
  'inspinia',
  'pace',
    'sweetalert',
  'nestable'

  ],
  function (angular, $, _, appLevelRequire) {

    "use strict";
    /*
    登录页

    // var username = $.cookie('rtd_username');
    // var password = $.cookie('rtd_password');
    // var realUsername = "";
    // var realPassword = "";
    // $.ajaxSettings.async = false;
    // $.getJSON('assets/json/login.json', function(data){
    //   realUsername =data.username;
    //   realPassword = data.password;
    // });
    // $.ajaxSettings.async = true;
    // //var a = sessionStorage.getItem(realUsername);
    // //if(username==realUsername&&password==realPassword){
    // //self.current.headHide = false;
    //
    // // if(typeof(username)=="undefined"){
    // //     window.location.href = window.location.origin+window.location.pathname+"login.html";
    // // }
    // if(username!==realUsername||password!==realPassword){
    //
    //   sessionStorage.setItem("goalUrl",window.location.hash);
    //
    //   window.location.href = window.location.origin+window.location.pathname.replace("index.html","")+"login.html";
    // }
    // [].slice.call( document.querySelectorAll( 'select.cs-select' ) ).forEach( function(el) {
    //   new SelectFx(el);
    // } );

     */
    if (typeof String.prototype.startsWith != 'function') {
      String.prototype.startsWith = function (prefix){
        return this.slice(0, prefix.length) === prefix;
      };
    }
    if (typeof String.prototype.endsWith != 'function') {
      String.prototype.endsWith = function(suffix) {
        return this.indexOf(suffix, this.length - suffix.length) !== -1;
      };
    }
    var app = angular.module('kibana', ['ngRoute', 'ngSanitize','pascalprecht.translate','oitozero.ngSweetAlert']),
      // we will keep a reference to each module defined before boot, so that we can
      // go back and allow it to define new features later. Once we boot, this will be false
      pre_boot_modules = [],
      // these are the functions that we need to call to register different
      // features if we define them after boot time
      register_fns = {};

    /**
     * Tells the application to watch the module, once bootstraping has completed
     * the modules controller, service, etc. functions will be overwritten to register directly
     * with this application.
     * @param  {[type]} module [description]
     * @return {[type]}        [description]
     */
    app.useModule = function (module) {
      if (pre_boot_modules) {
        pre_boot_modules.push(module);
      } else {
        _.extend(module, register_fns);
      }
      return module;
    };

    app.safeApply = function ($scope, fn) {
      switch($scope.$$phase) {
        case '$apply':
          // $digest hasn't started, we should be good
          $scope.$eval(fn);
          break;
        case '$digest':
          // waiting to $apply the changes
          setTimeout(function () { app.safeApply($scope, fn); }, 10);
          break;
        default:
          // clear to begin an $apply $$phase
          $scope.$apply(fn);
          break;
      }
    };

    app.config(function ($routeProvider, $controllerProvider, $compileProvider, $filterProvider, $provide) {
      $routeProvider
        .when('/dashboard', {
          templateUrl: 'app/partials/dashboard.html',
        })
        .when('/dashboard/:kbnType/:kbnId', {
          templateUrl: 'app/partials/dashboard.html',
        })
        .when('/dashboard/:kbnType/:kbnId/:params', {
          templateUrl: 'app/partials/dashboard.html'
        })
        .when('/demo',{
          templateUrl: 'app/partials/demo.html',
        })
        .when('/demo1',{
        templateUrl: 'app/partials/demo1.html',
      })
        .when('/template_demo',{
          templateUrl: 'app/partials/template_demo.html',
        })
        .when('/demo2',{
          templateUrl: 'app/partials/demo2.html',
        })
        .when('/demo3',{
          templateUrl: 'app/partials/demo3.html',
        })
        .when('/demo4',{
          templateUrl: 'app/partials/demo4.html',
        })
        .otherwise({
          redirectTo: 'dashboard'
        });
      // this is how the internet told me to dynamically add modules :/
      register_fns.controller = $controllerProvider.register;
      register_fns.directive  = $compileProvider.directive;
      register_fns.factory    = $provide.factory;
      register_fns.service    = $provide.service;
      register_fns.filter     = $filterProvider.register;
    });

    app.config(['$translateProvider',function($translateProvider){
      var lang = window.localStorage.lang||'cn';

      $translateProvider.useStaticFilesLoader({
        prefix: './i18n/',
        suffix: '.json'
      });
      $translateProvider.preferredLanguage(lang);
    }]);

    app.config(['$qProvider', function ($qProvider) {
      $qProvider.errorOnUnhandledRejections(false);
    }]);

    app.config(['$sceDelegateProvider', function($sceDelegateProvider) {
      $sceDelegateProvider.resourceUrlWhitelist([
        '**'

      ]);
    }]);

    var apps_deps = [
      'elasticjs.service',
      'solrjs.service',
      '$strap.directives',
      'ngSanitize',
      'ngDragDrop',
      'ngMaterial',
      'smart-table',
      'kibana',
    ];

    _.each('controllers directives factories services filters'.split(' '),
      function (type) {
        var module_name = 'kibana.'+type;
        // create the module
        app.useModule(angular.module(module_name, []));
        // push it into the apps dependencies
        apps_deps.push(module_name);
      });



    app.panel_helpers = {
      partial: function (name) {
        return 'app/partials/'+name+'.html';
      }
    };

    // load the core components
    require([
      'controllers/all',
      'directives/all',
      'filters/all',
    ], function () {

      // bootstrap the app
      angular
        .element(document)
        .ready(function() {
          $('body').attr('ng-controller', 'DashCtrl');
          angular.bootstrap(document, apps_deps)
            .invoke(['$rootScope', function ($rootScope) {
              _.each(pre_boot_modules, function (module) {
                _.extend(module, register_fns);
              });
              pre_boot_modules = false;

              $rootScope.requireContext = appLevelRequire;
              $rootScope.require = function (deps, fn) {
                var $scope = this;
                $scope.requireContext(deps, function () {
                  var deps = _.toArray(arguments);
                  $scope.$apply(function () {
                    fn.apply($scope, deps);
                  });
                });
              };
            }]);
        });
    });

    return app;
  });
