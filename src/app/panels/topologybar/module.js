/*
  ## pies

  ### Parameters
  * style :: A hash of css styles
  * size :: top N
  * arrangement :: How should I arrange the query results? 'horizontal' or 'vertical'
  * chart :: Show a chart? 'none', 'bar', 'pie'
  * donut :: Only applies to 'pie' charts. Punches a hole in the chart for some reason
  * tilt :: Only 'pie' charts. Janky 3D effect. Looks terrible 90% of the time.
  * lables :: Only 'pie' charts. Labels on the pie?
*/
define([
  'angular',
  'app',
  'underscore',
  'jquery',
  'kbn',
  'echarts-liquidfill',
    'echarts-wordcloud'

],
function (angular, app, _, $, kbn) {
  'use strict';

  var module = angular.module('kibana.panels.network', []);
  app.useModule(module);

  module.controller('topologybar', function($scope, $http,$sce,$timeout, $translate,timer, querySrv, dashboard, filterSrv) {
    $scope.panelMeta = {
      exportfile: true,
      editorTabs : [
        {title:$translate.instant('Queries'), src:'app/partials/querySelect.html'}
      ],
      status  : "Stable",
      description : ""
    };

    // Set and populate defaults
    var _d = {
      queries     : {
        mode        : 'all',
        ids         : [],
        query       : '*:*',
        custom      : ''
      },
      mode    : 'count', // mode to tell which number will be used to plot the chart.
      field   : '',
      stats_field : '',
      decimal_points : 0, // The number of digits after the decimal point
      exclude : [],
      missing : false,
      other   : false,
      size    : 10000,
      sortBy  : 'count',
      order   : 'descending',
      fontsize   : 12,
      donut   : false,
      HbaseIP:'',
      tilt    : false,
      display:'block',
      edge:'',
      icon:"icon-caret-down",
      labels  : true,
	  ylabels :true,
      logAxis : false,
      arrangement : 'vertical',
	  RoseType	  : 'area',
      chart       : 'network',
        solrFq :filterSrv.getSolrFq(),
      exportSize : 10000,
        linkage_id:'a',
        value_sort:'rs_timestamp',
        defaulttimestamp:true,
      lastColor : '',
      spyable     : true,
      show_queries:true,
      error : '',
      chartColors : querySrv.colors,
      refresh: {
        enable: false,
        interval: 2
      }
    };
    _.defaults($scope.panel,_d);

    $scope.init = function () {
      $scope.hits = 0;
      //$scope.testMultivalued();

      // Start refresh timer if enabled
      if ($scope.panel.refresh.enable) {
        $scope.set_timer($scope.panel.refresh.interval);
      }

      $scope.$on('refresh',function(){
        $scope.get_data();
      });
      
      $scope.get_data();
    };

    $scope.testMultivalued = function() {
      if($scope.panel.field && $scope.fields.typeList[$scope.panel.field] && $scope.fields.typeList[$scope.panel.field].schema.indexOf("M") > -1) {
        $scope.panel.error = "Can't proceed with Multivalued field";
        return;
      }

      if($scope.panel.stats_field && $scope.fields.typeList[$scope.panel.stats_field].schema.indexOf("M") > -1) {
        $scope.panel.error = "Can't proceed with Multivalued field";
        return;
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
    /**
     *
     *
     * @param {String} filetype -'json', 'xml', 'csv'
     */
    $scope.build_query = function(filetype, isForExport) {

      // Build Solr query
      var fq = 'fl='+$scope.panel.field+' '+$scope.panel.edge+'&wt=json'+($scope.panel.queries.custom != null ? $scope.panel.queries.custom : '');


      //http://10.0.67.17:8080/getServerMapData.pinpoint?applicationName=DMDB&from=1499937049000&to=1499937349000&callerRange=1&calleeRange=1&serviceTypeName=TOMCAT&_=1499937383140
      //var surl = $sce.trustAsResourceUrl("http://10.0.67.14:28080/getServerMapData.pinpoint?applicationName=test123&from=1499838187000&to=1499838487000&callerRange=1&calleeRange=1&serviceTypeName=TOMCAT&_=1499838447935");
      // $.ajax({
      //   type: "get",
      //   async: false,
      //   url: "http://www.runoob.com/try/ajax/jsonp.php?jsoncallback=?",
      //   dataType: "jsonp",
      //   jsonp: "callback",
      //   jsonpCallback: "?",
      //   success: function(data){
      //    aaa = data;
      //
      //   },
      //   error: function(data){
      //     aaa = data.getAllResponseHeaders;
      //
      //   }
      // });
      // $.getJSON(surl, function(data) {
      //     aaa = data;
      // });
      // $http.jsonp("http://59.110.9.55:28080/getServerMapData.pinpoint?applicationName=dataviz2&from=1499761406000&to=1499934206000&callerRange=1&calleeRange=1&serviceTypeName=TOMCAT&_=1499915283292")
      //   .then(function successCallback(response){
      //     aaa = response;
      //   }, function errorCallback(response){
      //     aaa = response;
      //   });
      // window.JSON_CALLBACK = function(data) {
      //
      //  var aa =data;
      // };



      //var bbb = aaa;
      // if (filterSrv.getSolrFq()) {
      //   fq = '&' + filterSrv.getSolrFq();
      //     if(!$scope.panel.defaulttimestamp){
      //         fq = fq.replace(filterSrv.getTimeField(),$scope.panel.value_sort);
      //     }
      // }
      // var wt_json = '&wt=' + filetype;
      // var rows_limit = isForExport ? '&rows=0' : ''; // for pies, we do not need the actual response doc, so set rows=0
      // var facet = '';
      //
      // if ($scope.panel.mode === 'count') {
      //   facet = '&facet=true&facet.field=' + $scope.panel.field + '&facet.limit=' + $scope.panel.size + '&facet.missing=true';
      // } else {
      //   // if mode != 'count' then we need to use stats query
      //   // stats does not support something like facet.limit, so we have to sort and limit the results manually.
      //   facet = '&stats=true&stats.facet=' + $scope.panel.field + '&stats.field=' + $scope.panel.stats_field + '&facet.missing=true';
      // }
      // facet += '&f.' + $scope.panel.field + '.facet.sort=' + ($scope.panel.sortBy || 'count');
      //
      // var exclude_length = $scope.panel.exclude.length;
      // var exclude_filter = '';
      // if(exclude_length > 0){
      //   for (var i = 0; i < exclude_length; i++) {
      //     if($scope.panel.exclude[i] !== "") {
      //       exclude_filter += '&fq=-' + $scope.panel.field +":"+ $scope.panel.exclude[i];
      //     }
      //   }
      // }

      return  fq ;
    };

    $scope.exportfile = function(filetype) {

      var query = this.build_query(filetype, true);

      $scope.sjs.client.server(dashboard.current.solr.server + dashboard.current.solr.core_name);

      var request = $scope.sjs.Request().indices(dashboard.indices),
          response;

      request.setQuery(query);

      response = request.doSearch();

      // Populate scope when we have results
      response.then(function(response) {
        kbn.download_response(response, filetype, "pies");
      });
    };

    $scope.set_timer = function(refresh_interval) {
      $scope.panel.refresh.interval = refresh_interval;
      if (_.isNumber($scope.panel.refresh.interval)) {
        timer.cancel($scope.refresh_timer);
        $scope.realtime();
      } else {
        timer.cancel($scope.refresh_timer);
      }
    };

    $scope.realtime = function() {
      if ($scope.panel.refresh.enable) {
        timer.cancel($scope.refresh_timer);

        $scope.refresh_timer = timer.register($timeout(function() {
          $scope.realtime();
          $scope.get_data();
        }, $scope.panel.refresh.interval*1000));
      } else {
        timer.cancel($scope.refresh_timer);
      }
    };

    $scope.get_data = function() {
      $scope.data = {};
      if(($scope.panel.linkage_id === dashboard.current.linkage_id)||dashboard.current.enable_linkage) {
       if(!(_.isUndefined(dashboard.current.hbasedata))){
        for(var i1 = 0;i1<dashboard.current.hbasedata.applicationMapData.nodeDataArray.length;i1++){
          if(dashboard.current.hbasedata.applicationMapData.nodeDataArray[i1].key===dashboard.current.network_node_id ){
            $scope.data = dashboard.current.hbasedata.applicationMapData.nodeDataArray[i1].histogram;
            break;
          }
        }
         $scope.$emit('render');
       }
      }
    };

    $scope.build_search = function(term,negate) {
            if (_.isUndefined(term.meta)) {
                filterSrv.set({
                    type: 'terms', field: $scope.panel.field, value: term.name,
                    mandate: (negate ? 'mustNot' : 'must')
                });
            } else if (term.meta === 'missing') {
                filterSrv.set({
                    type: 'exists', field: $scope.panel.field,
                    mandate: (negate ? 'must' : 'mustNot')
                });
            } else {
                return;
            }
            dashboard.current.linkage_id = $scope.panel.linkage_id;
            dashboard.current.enable_linkage = false;
            dashboard.refresh();

    };

    $scope.set_refresh = function (state) {
      $scope.refresh = state;
      // if 'count' mode is selected, set decimal_points to zero automatically.
      if ($scope.panel.mode === 'count') {
        $scope.panel.decimal_points = 0;
      }
    };

    $scope.close_edit = function() {
      // Start refresh timer if enabled
      if ($scope.panel.refresh.enable) {
        $scope.set_timer($scope.panel.refresh.interval);
      }

      if ($scope.refresh) {
        // $scope.testMultivalued();
        $scope.get_data();
      }
      $scope.refresh =  false;
      $scope.$emit('render');
    };

    $scope.showMeta = function(term) {
      if(_.isUndefined(term.meta)) {
        return true;
      }
      if(term.meta === 'other' && !$scope.panel.other) {
        return false;
      }
      if(term.meta === 'missing' && !$scope.panel.missing) {
        return false;
      }
      return true;
    };

  });

  module.directive('topologybarChart', function(querySrv,dashboard,filterSrv) {
    return {
      restrict: 'A',
      link: function(scope, elem) {
        var myChart;
        // Receive render events
        scope.$on('render',function(){
          render_panel();
        });

        // Re-render if the window is resized
        angular.element(window).bind('resize', function(){
          render_panel();
        });

        // Function for rendering panel
        function render_panel() {
          var colors = [];

          // IE doesn't work without this
            elem.css({height:scope.panel.height||scope.row.height});

          // Make a clone we can operate on.


          if (filterSrv.idsByTypeAndField('pies',scope.panel.field).length > 0) {
            colors.push(scope.panel.lastColor);
          } else {
            colors = scope.panel.chartColors;
          }

          var idd = scope.$id;
          var labelcolor = false;
          if (dashboard.current.style === 'dark'){
              labelcolor = true;
          }
                // Add plot to scope so we can build out own legend
          var echarts = require('echarts');
         // require(['vis'], function(nw){
          if(myChart) {
            myChart.dispose();
          }
          if(scope.panel.chart === 'network') {
            var j1 = 0;
            var x_data = [];
            var data_data=[];
            for(var item in scope.data){
              x_data[j1]=item;
              data_data[j1]=scope.data[item];
              j1++;
            }
            myChart = echarts.init(document.getElementById(idd));
            var option3 = {
              color:colors,
              tooltip : {
                trigger: 'axis',
                confine:true,
                axisPointer : {            // 坐标轴指示器，坐标轴触发有效
                  type : 'shadow'        // 默认为直线，可选为：'line' | 'shadow'
                }
              },
              grid: {
                left: '3%',
                right: '3%',
                bottom: '3%',
                top: '6%',
                containLabel: true
              },
              xAxis : [
                {
                  type : 'category',
                  data : x_data,
                  axisLine:{
                    show:false
                  },
                  axisLabel:{
                    show:true,
                    textStyle:{
                      color:labelcolor ? '#fff':'#4F4F4F',
                      fontSize:12,
                    }
                  },
                  axisTick: {
                    show:false,
                    alignWithLabel: false
                  }
                }
              ],
              yAxis : [
                {
                  type : 'value',
                  splitLine: {
                    show :false,
                    lineStyle:{
                      type:'dotted',
                      axisTick: {
                        show:false
                      },
                      color: labelcolor ? '#4F4F4F':'#F8F8FF'
                    }
                  },
                  axisLabel:{
                    show:true,
                    textStyle:{
                      color:labelcolor ? '#fff':'#4F4F4F',
                      fontSize:12+2,
                      fontStyle: 'italic'
                    }
                  },
                  nameTextStyle:{

                    color:labelcolor ? '#fff':'#4F4F4F',


                  },
                  axisLine:{
                    show:false
                  }
                }
              ],
              series : [
                {
                  name:scope.panel.title,
                  type:'bar',
                  barWidth: '43%',
                  data:data_data,
                  itemStyle: {
                    normal: {
                      color: function(params) {
                        var colorList = colors;
                        return colorList[params.dataIndex];
                      },
                      shadowColor: '#fff',
                      barBorderRadius: 5

                    }
                  }
                }
              ]
            };
            myChart.setOption(option3);
            // var bb = network.getSelection();
            // var cc= bb;
           // });
          }


       // });
        }
      }
    };
  });

});