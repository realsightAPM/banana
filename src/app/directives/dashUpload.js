define([
    'angular',
    'jquery',
    'toastr'
  ],
  function(angular) {
    'use strict';
    var toastr = require('toastr');
    toastr.options = {
      closeButton: true,
      progressBar: true,
      showMethod: 'slideDown',
      showEasing: "swing",
      timeOut: 3000
    };
    var module = angular.module('kibana.directives');

    module.directive('dashUpload', function(timer, dashboard, $translate) {
      return {
        restrict: 'A',
        link: function(scope) {
          function file_selected(evt) {
            var files = evt.target.files; // FileList object
            var readerOnload = function() {
              return function(e) {
                try {
                  dashboard.dash_load(JSON.parse(e.target.result));
                  scope.$apply();
                } catch (err) {
                  toastr.error($translate.instant('The file is not valid json file'), 'RealsightAPM');
                  dashboard.refresh();
                }
              };
            };
            for (var i = 0, f; f = files[i]; i++) {
              var reader = new FileReader();
              reader.onload = (readerOnload)(f);
              reader.readAsText(f);
            }
            document.getElementById('dashupload').value = "";
          }
          // Check for the various File API support.
          if (window.File && window.FileReader && window.FileList && window.Blob) {
            // Something
            document.getElementById('dashupload').addEventListener('change', file_selected, false);
          } else {
            toastr.warning($translate.instant('HTML5 File APIs are not fully supported in this browser'), 'RealsightAPM');
          }
        }
      };
    });
  });
