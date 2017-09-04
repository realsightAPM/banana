/*

 ## Column

 ### Parameters
 * panels :: an array of panel objects. All of their spans should be set to 12

 */
define([
    'angular',
    'app',
    'underscore',
    'config'
  ],
  function (angular, app, _, config) {
    'use strict';

    var module = angular.module('kibana.panels.column', []);

    app.useModule(module);

    module.controller('column', function($scope, $rootScope, $timeout) {
      $scope.panelMeta = {
        status  : "Stable",
        description : ""
      };

      // Set and populate defaults
      var _d = {
        panelExpand:true,
        display:'block',
        icon:"icon-caret-down",
        panels : []
      };
      _.defaults($scope.panel,_d);

      $scope.init = function(){
        $scope.reset_panel();
      };

      $scope.toggle_row = function(panel) {
        panel.collapse = panel.collapse ? false : true;
        if (!panel.collapse) {
          $timeout(function() {
            $scope.send_render();
          });
        }
      };

      $scope.display=function() {
        if($scope.panel.display === 'none'){
          $scope.panel.display='block';
          $scope.panel.icon="icon-caret-down";


        }else{
          $scope.panel.display='none';
          $scope.panel.icon="icon-caret-up";
        }
      };
      $scope.reSize=function() {

        $scope.panel.useInitHeight=!$scope.panel.useInitHeight;

        var ibox = $('#'+$scope.$id+'z').closest('div.ibox1');
        var button = $('#'+$scope.$id+'z').find('i');
        //var aaa = '#'+$scope.$id+'z';
        $('body').toggleClass('fullscreen-ibox1-mode');
        button.toggleClass('fa-expand').toggleClass('fa-compress');
        ibox.toggleClass('fullscreen');
        $scope.panel.fullHeight = ibox[0].offsetHeight-60;
        $scope.$emit('render');
        $(window).trigger('resize');


      };
      $scope.send_render = function() {
        $scope.$broadcast('render');
      };

      $scope.add_panel = function(panel) {
        $scope.panel.panels.push(panel);
      };

      $scope.reset_panel = function(type) {
        $scope.new_panel = {
          loading: false,
          error: false,
          sizeable: false,
          span: 12,
          height: "150px",
          editable: true,
          type: type,
          draggable: false
        };
      };

    });

    module.directive('columnEdit', function($compile,$timeout) {
      return {
        scope : {
          new_panel:"=panel",
          row:"=",
          config:"=",
          dashboards:"=",
          type:"=type"
        },
        link: function(scope, elem) {
          scope.$on('render', function () {

            // Make sure the digest has completed and populated the attributes
            $timeout(function() {
              // Create a reference to the new_panel as panel so that the existing
              // editors work with our isolate scope
              scope.panel = scope.new_panel;
              var template = '<div ng-include src="partial(\'panelgeneral\')"></div>';

              if(!(_.isUndefined(scope.type)) && scope.type !== "") {
                template = template+'<div ng-include src="\'app/panels/'+scope.type+'/editor.html\'"></div>';
              }
              elem.html($compile(angular.element(template))(scope));
            });
          });
        }
      };
    });

    module.filter('withoutColumn', function() {
      return function() {
        return _.without(config.panel_names,'column');
      };
    });
  });
