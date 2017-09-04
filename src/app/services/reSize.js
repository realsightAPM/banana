define([
  'angular',
  'underscore',
  'jquery'
],
function (angular,$, _) {
  'use strict';

  var module = angular.module('kibana.services');

  module.service('reSize', function() {
    // This service really just tracks a list of $timeout promises to give us a
    // method for cancelling them all when we need to
    this.reSize = function() {
      var ibox = $(this).closest('div.ibox');
      var button = $(this).find('i');
      $('body').toggleClass('fullscreen-ibox-mode');
      button.toggleClass('fa-expand').toggleClass('fa-compress');
      ibox.toggleClass('fullscreen');
      $scope.panel.fullHeight = ibox[0].offsetHeight-60;
      setTimeout(function () {
        $(window).trigger('resize');
      }, 100);
    };

      // Collapse ibox function
      // $('.collapse-link').on('click', function () {
      //   var ibox = $(this).closest('div.ibox');
      //   var button = $(this).find('i');
      //   var content = ibox.children('.ibox-content');
      //   content.slideToggle(200);
      //   button.toggleClass('fa-chevron-up').toggleClass('fa-chevron-down');
      //   ibox.toggleClass('').toggleClass('border-bottom');
      //   setTimeout(function () {
      //     ibox.resize();
      //     ibox.find('[id^=map-]').resize();
      //   }, 50);
      // });
      //
      // // Close ibox function
      // $('.close-link').on('click', function () {
      //   var content = $(this).closest('div.ibox');
      //   content.remove();
      // });
      //
      // // Fullscreen ibox function
      // $('.fullscreen-link').on('click', function () {
      //
      // });

      // Close menu in canvas mode



  });

});
