define([
    'angular',
    'config',
    'underscore',
    'services/all',
    'angular-aria',
    'angular-animate',
    'angular-material',
  ],
  function (angular) {
    "use strict";

    var module = angular.module('kibana.alarms', ['ngMaterial']);

    module.controller('AlarmCtrl', function ($scope, $timeout, $filter, timer, dashboard) {

      $scope.opened_incidents = [
        {
          "id": "24527",
          "name":"日报系统流量告警",
          "status": "warning",
          "open_num": "3",
          "open_time": "2016-11-11 20:50:00",
          "close_time": "",
          "duration": "1小时35分钟",
          "acknowledge": "shi.zf@neusoft.com",
        },
        {
          "id": "23127",
          "name":"日报系统CPU使用率告警",
          "status": "warning",
          "open_num": "4",
          "open_time": "2016-11-11 19:50:00",
          "close_time": "",
          "duration": "25分钟",
          "acknowledge": "shi.zf@neusoft.com",
        },
        {
          "id": "14998",
          "name":"日报系统内存使用率告警",
          "status": "warning",
          "open_num": "3",
          "open_time": "2016-11-11 10:50:00",
          "close_time": "",
          "duration": "35分钟",
          "acknowledge": "shi.zf@neusoft.com",
        },
        {
          "id": "17861",
          "name":"日报系统吞吐量告警",
          "status": "warning",
          "open_num": "5",
          "open_time": "2016-11-11 20:50:00",
          "close_time": "",
          "duration": "2小时10分钟",
          "acknowledge": "shi.zf@neusoft.com",
        },
        {
          "id": "09823",
          "name":"日报系统用户体验告警",
          "status": "danger",
          "open_num": "1",
          "open_time": "2016-11-11 18:45:00",
          "close_time": "",
          "duration": "10分钟",
          "acknowledge": "shi.zf@neusoft.com",
        },
        {
          "id": "07617",
          "name":"日报系统健康度告警",
          "status": "warning",
          "open_num": "1",
          "open_time": "2016-11-11 10:20:00",
          "close_time": "",
          "duration": "3分钟",
          "acknowledge": "shi.zf@neusoft.com",
        },
      ]

      $scope.build_query = function(filetype, isForExport) {
        // Build Solr query
        var fq = '';
        var wt_json = '&wt=' + filetype;
        var rows_limit = '&rows=10';
        var facet = '&facet=true&facet.field=' + $scope.ad_name_field + '&facet.limit=' + $scope.facet_limit + '&facet.missing=true';

        return querySrv.getORquery() + wt_json + rows_limit + fq + facet;
      };

      $scope.get_data = function() {


      };

      $scope.get_data();




    });
  });
