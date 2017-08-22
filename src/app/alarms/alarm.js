define([
    'angular',
    'config',
    'underscore',
    'services/all',
    'angular-aria',
    'angular-animate',
    'angular-material',
    'angular-smart-table',
  ],
  function (angular) {
    "use strict";

    var module = angular.module('kibana.alarms', ['ngMaterial', 'smart-table']);

    module.controller('AlarmCtrl', function ($scope, $timeout, $filter, timer, dashboard) {

      $scope.rowCollection = [
        {firstName: 'Laurent', lastName: 'Renard', birthDate: new Date('1987-05-21'), balance: 102, email: 'whatever@gmail.com'},
        {firstName: 'Blandine', lastName: 'Faivre', birthDate: new Date('1987-04-25'), balance: -2323.22, email: 'oufblandou@gmail.com'},
        {firstName: 'Francoise', lastName: 'Frere', birthDate: new Date('1955-08-27'), balance: 42343, email: 'raymondef@gmail.com'}
      ];




    });
  });
