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

    module.controller('topologyscatter', function($scope, $http,$sce,$timeout, $translate,timer, querySrv, dashboard, filterSrv) {
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
        //同id 图表刷新，图表自身点击不刷新，时间选择全局刷新，更换应用刷新
        if((($scope.panel.linkage_id === dashboard.current.linkage_id))||dashboard.current.enable_linkage) {
          $scope.query_url = "http://" + $scope.panel.HbaseIP + "/getScatterData.pinpoint?to="+dashboard.current.timeto+"&from="+dashboard.current.timefrom+"&limit=5000&filter=&application="+dashboard.current.network_app_name+"&xGroupUnit=987&yGroupUnit=1";
          //$scope.query_url = "http://" + $scope.panel.HbaseIP + "/getScatterData.pinpoint?to=1500275616000&from=1500275316000&limit=5000&filter=&application=chartsshow&xGroupUnit=987&yGroupUnit=1"+dashboard.current.network_app_name+"&from=" + dashboard.current.timefrom + "&to=" + dashboard.current.timeto + "&callerRange=1&calleeRange=1&serviceTypeName=TOMCAT";
          $.getJSON($scope.query_url, function (json) {
            $scope.data = json;
            //dashboard.current.hbasedata = json;
            //dashboard.current.network_force_refresh = false;
            $scope.$emit('render');
          });
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

    module.directive('topologyscatterChart', function(querySrv,dashboard,filterSrv) {
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
            var cloneData = scope.data;
            cloneData.scatter.dotList.reverse();
            var idd = scope.$id;
            var labelcolor = false;
            if (dashboard.current.style === 'dark'){
              labelcolor = true;
            }
            Date.prototype.pattern = function (fmt) {
              var o = {
                "M+" : this.getMonth() + 1, //月份
                "d+" : this.getDate(), //日
                "h+" : this.getHours() % 12 === 0 ? 12 : this.getHours() % 12, //小时
                "H+" : this.getHours(), //小时
                "m+" : this.getMinutes(), //分
                "s+" : this.getSeconds(), //秒
                "q+" : Math.floor((this.getMonth() + 3) / 3), //季度
                "S" : this.getMilliseconds() //毫秒
              };
              var week = {
                "0" : "/u65e5",
                "1" : "/u4e00",
                "2" : "/u4e8c",
                "3" : "/u4e09",
                "4" : "/u56db",
                "5" : "/u4e94",
                "6" : "/u516d"
              };
              if (/(y+)/.test(fmt)) {
                fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
              }
              if (/(E+)/.test(fmt)) {
                fmt = fmt.replace(RegExp.$1, ((RegExp.$1.length > 1) ? (RegExp.$1.length > 2 ? "/u661f/u671f" : "/u5468") : "") + week[this.getDay() + ""]);
              }
              for (var k in o) {
                if (new RegExp("(" + k + ")").test(fmt)) {
                  fmt = fmt.replace(RegExp.$1, (RegExp.$1.length === 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
                }
              }
              return fmt;
            };
            // Add plot to scope so we can build out own legend
            var echarts = require('echarts');
            // require(['vis'], function(nw){
            if(myChart) {
              myChart.dispose();
            }
            if(scope.panel.chart === 'network') {

              var time ;
              var timeData = [];
              var success_i=0;
              var error_i=0;
              var success_data=[];
              var error_data = [];

              for(var i1=0;i1<cloneData.scatter.dotList.length;i1++){
                if(!isNaN(cloneData.scatter.dotList[i1][0])){
                  time = new Date(cloneData.scatter.dotList[i1][0]+cloneData.from);
                  timeData[i1] = time.toLocaleString();
                }else{
                  timeData[i1] =cloneData.scatter.dotList[i1][0];
                }

                if(cloneData.scatter.dotList[i1][4]===1){
                  success_data[success_i]=cloneData.scatter.dotList[i1];
                  success_data[success_i][0]=timeData[i1];
                  success_i++;
                }else{
                  error_data[error_i]=cloneData.scatter.dotList[i1];
                  error_data[error_i][0]=timeData[i1];
                  error_i++;
                }
              }
              myChart = echarts.init(document.getElementById(idd));
              var option3 =  {
                grid: {
                  left: '3%',
                  right: '4%',
                  bottom: '3%',
                  containLabel: true
                },
                toolbox: {
                  feature: {
                    dataZoom: {
                      yAxisIndex: 'none'
                    },
                    dataView: {readOnly: false},
                    restore: {}
                  }
                },
                color:['#EF843C','#1ab0f9'],
                tooltip : {
                  trigger: 'item',
                  showDelay : 0,
                  formatter : function (params) {
                    if (params.value.length > 1) {
                      return params.seriesName + ' :<br/>'
                        + params.value[0]+'<br/>'
                        + params.value[1] + 'ms ';
                    }
                    else {
                      return params.seriesName + ' :<br/>'
                        + params.name + ' :<br/>'
                        + params.value + 'ms ';
                    }
                  },
                  axisPointer:{
                    show: true,
                    type : 'cross',
                    lineStyle: {
                      type : 'dashed',
                      width : 1
                    }
                  }
                },
                legend: {
                  data: ["success","error"],
                  left: 'left'
                },
                xAxis : [
                  {
                    type : 'category',
                    boundaryGap : false,
                    axisLine: {onZero: true},
                    axisLabel:{
                      textStyle:{
                        color:labelcolor?'#DCDCDC':'#696969'
                      }
                    },
                    data :timeData
                  }
                ],
                yAxis : [
                  {
                    type : 'value',
                    scale:true,
                    axisLabel : {
                      formatter: '{value} ms'
                    },
                    splitLine: {
                      lineStyle: {
                        type: 'dashed'
                      }
                    }
                  }
                ],
                series : [
                  {
                    name:"error",
                    type:'scatter',
                    data: error_data,
                    markPoint : {
                      data : [
                        {type : 'max', name: '最大值'},
                        {type : 'min', name: '最小值'}
                      ]
                    }
                  }, {
                    name:"success",
                    type:'scatter',
                    data: success_data,
                    markPoint : {
                      data : [
                        {type : 'max', name: '最大值'},
                        {type : 'min', name: '最小值'}
                      ]
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
