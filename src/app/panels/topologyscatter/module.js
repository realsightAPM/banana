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
    'echarts-wordcloud',
    'd3',
    'fisheye',
    'angular-smart-table'

  ],
  function (angular, app, _, $, kbn) {
    'use strict';

    var module = angular.module('kibana.panels.network', ['smart-table']);
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
        panelExpand:true,
        fullHeight:'700%',
        useInitHeight:true,
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
        dataZoom:false,
        sortBy  : 'count',
        order   : 'descending',
        fontsize   : 12,
        donut   : false,
        HbaseIP:'',
        tilt    : false,
        options: true,
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
        itemsByPage: 10,
        displayPage: 10,
        chartColors : querySrv.colors,
        refresh: {
          enable: false,
          interval: 2
        }
      };
      _.defaults($scope.panel,_d);

      $scope.init = function () {
        // $('.fullscreen-link').on('click', function () {
        //   var ibox = $(this).closest('div.ibox1');
        //   var button = $(this).find('i');
        //
        //   $('body').toggleClass('fullscreen-ibox1-mode');
        //   button.toggleClass('fa-expand').toggleClass('fa-compress');
        //   ibox.toggleClass('fullscreen');
        //   $scope.panel.useInitHeight=!$scope.panel.useInitHeight;
        //   $scope.$emit('render');
        //
        //   $(window).trigger('resize');
        //
        // });
        $scope.hits = 0;
        //$scope.testMultivalued();
        $scope.options =false;
        $scope.filteredItems = [];
        $scope.groupedItems = [];
        $scope.itemsPerPage = 10;
        $scope.pagedItems = [];
        $scope.currentPage = 0;
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

      //快捷键+控制放大缩小panel
      $scope.zoomOut=function() {
        if(window.event.keyCode===107){
          $scope.reSize();
        }


      };

      // $scope.reSize_y=function() {
      //
      //   $scope.panel.useInitHeight=!$scope.panel.useInitHeight;
      //
      //   var ibox = $('#'+$scope.$id+'y').closest('div.ibox1');
      //   var button = $('#'+$scope.$id+'y').find('i');
      //   //var aaa = '#'+$scope.$id+'z';
      //   $('body').toggleClass('fullscreen-ibox1-mode');
      //   button.toggleClass('fa-expand').toggleClass('fa-compress');
      //   ibox.toggleClass('fullscreen');
      //   $scope.$emit('render');
      //   $(window).trigger('resize');
      //
      //
      // };

      $scope.display=function() {
        if($scope.panel.display === 'none'){
          $scope.panel.display='block';
          $scope.panel.icon="icon-caret-down";


        }else{
          $scope.panel.display='none';
          $scope.panel.icon="icon-caret-up";
        }
      };

    //翻页设置

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
          $scope.query_url = "http://" + $scope.panel.HbaseIP + "/getScatterData.pinpoint?to="+dashboard.current.timeto+"&from="+dashboard.current.timefrom+"&limit=10000&filter=&application="+dashboard.current.network_app_name+"&xGroupUnit=987&yGroupUnit=1";
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

    module.directive('topologyscatterChart', function(querySrv,$http,dashboard,filterSrv,$translate) {
      return {
        restrict: 'A',
        link: function(scope, elem) {
          var myChart;
          var myChart1;
          var myChart2;
          var myChart3;
          scope.panelMeta.loading = false;
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
            $('#myTab li:eq(0) a').tab('show');
            // IE doesn't work without this
            var divHeight=scope.panel.height||scope.row.height;
            if(!scope.panel.useInitHeight){
              divHeight = scope.panel.fullHeight;
            }
            elem.css({height:divHeight});

            // Make a clone we can operate on.


            if (filterSrv.idsByTypeAndField('pies',scope.panel.field).length > 0) {
              colors.push(scope.panel.lastColor);
            } else {
              colors = scope.panel.chartColors;
            }
            var cloneData = scope.data;
            var tabel_data = scope.data;
            if(!isNaN(cloneData.scatter.dotList[0][0])){
              cloneData.scatter.dotList.reverse();
            }
            var idd = scope.$id;
            var labelcolor = false;
            if (dashboard.current.style === 'dark'||dashboard.current.style === 'black'){
              labelcolor = true;
            }

            // Add plot to scope so we can build out own legend
            var echarts = require('echarts');
            // require(['vis'], function(nw){
            if(myChart) {
              myChart.dispose();
            }

            scope.showChart = function(url) {

            };
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
                  cloneData.scatter.dotList[i1][6] = cloneData.scatter.dotList[i1][0]+cloneData.from;
                  timeData[i1] = time.pattern("yyyy-MM-dd HH:mm:ss");
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
                color:['#ec4653','#1ab0f9'],
                dataZoom: scope.panel.dataZoom?[
                  {
                    type: 'slider',
                    show: true,
                    xAxisIndex: [0],
                    start: 1,
                    end: 35
                  },
                  {
                    type: 'slider',
                    show: true,
                    yAxisIndex: [0],
                    start: 0,
                    end: 30
                  },
                  {
                    type: 'inside',
                    xAxisIndex: [0],
                    start: 1,
                    end: 35
                  },
                  {
                    type: 'inside',
                    yAxisIndex: [0],
                    start: 0,
                    end: 30
                  }
                ]:[],
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
                  left: 'left',
                  textStyle:{
                    color:labelcolor?'#DCDCDC':'#696969'
                  }
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
                      formatter: '{value} ms',
                      textStyle:{
                        color:labelcolor?'#DCDCDC':'#696969'
                      }
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
                        {type : 'max', name: 'MAX'},
                        {type : 'min', name: 'MIN'}
                      ]
                    }
                  }, {
                    name:"success",
                    type:'scatter',
                    data: success_data,
                    markPoint : {
                      data : [
                        {type : 'max', name: 'MAX'},
                        {type : 'min', name: 'MIN'}
                      ]
                    }
                  }
                ]
              };

              myChart.setOption(option3);
              myChart.on('click', function (params) {
                // 点击联动
                $('#ibox1').toggleClass('sk-loading');
                var i0 = tabel_data.scatter.metadata["1"][0]+"^"+tabel_data.scatter.metadata["1"][2]+"^"+params.data[3];
                var post_data={I0:i0,T0:params.data[6],R0:params.data[1]};
                var post_url = "http://" + scope.panel.HbaseIP +"/transactionmetadata.pinpoint";
                var get_url =  "http://" + scope.panel.HbaseIP +"/transactionInfo.pinpoint?traceId="+i0+"&focusTimestamp="+params.data[6]+"&_="+new Date().getTime();
                // $.post("http://" + $scope.panel.HbaseIP +"/transactionmetadata.pinpoint",post_data,function (data,status,xhr) {
                //   var post = data;
                // });
                scope.options = true;
                $http({
                  method: "POST",
                  url: post_url,
                  data: post_data,
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  transformRequest: function(obj) {
                    var str = [];
                    for (var s in obj) {
                      str.push(encodeURIComponent(s) + "=" + encodeURIComponent(obj[s]));
                    }
                    return str.join("&");
                  }
                }).then(function successCallback(response) {
                  // 请求成功执行代码
                  var node_default={};
                  var edges_default=false;
                  var node_default_png=".png";
                  scope.startTime = new Date(response.data.metadata[0].startTime).pattern("yyyy-MM-dd HH:mm:ss");
                  scope.eventName = response.data.metadata[0].application;
                  scope.responseTime = response.data.metadata[0].elapsed;
                  scope.agentID = response.data.metadata[0].agentId;
                  scope.clientIP = response.data.metadata[0].remoteAddr;
                  scope.eventID = response.data.metadata[0].traceId;
                  if(response.data.metadata[0].exception){
                    scope.exception =$translate.instant("exception");
                    scope.exception_icon=1;
                    node_default_png="_ERROR.png";
                    node_default= {
                      borderWidth:6,
                      size:30,
                      color: {
                        border: '#ff5c30'
                      },
                      font:{ size: scope.panel.fontsize,
                        color: labelcolor?'#DCDCDC':'#696969'}
                    };
                    edges_default=true;
                  }else{
                    scope.exception_icon=0;
                    scope.exception =$translate.instant("normal");
                    node_default_png=".png";
                    node_default={
                      font: {
                        size: scope.panel.fontsize,
                        color: labelcolor?'#DCDCDC':'#696969'
                      }

                    };
                    edges_default=false;
                  }
                  $.ajaxSettings.async = false;
                  $.getJSON(get_url, function (json) {
                    var call_relationship = "";
                    var nodes = [];
                    var edges = [];
                    var callStackNodes = [];
                    var callStackEdges = [];
                    var dir = 'nodestyle/';
                    var to_time = params.data[6]+20*60*1000;
                    var show_chart_url = "http://" + scope.panel.HbaseIP +"/getAgentStat.pinpoint?agentId="+json.agentId+"&from="+params.data[6]+"&to="+to_time+"&sampleRate=1"+"&_="+new Date().getTime();
                    for (var i1 = 0;i1<json.applicationMapData.nodeDataArray.length;i1++){
                      // var url = "data:image/svg+xml;charset=utf-8,"+ encodeURIComponent(svg[json.applicationMapData.nodeDataArray[i1].category]);
                      nodes.push({id:json.applicationMapData.nodeDataArray[i1].key, label: json.applicationMapData.nodeDataArray[i1].applicationName, image: dir + json.applicationMapData.nodeDataArray[i1].category+node_default_png, shape: 'image'});
                    }
                    for (var i2 = 0;i2<json.applicationMapData.linkDataArray.length;i2++){

                      edges.push({from: json.applicationMapData.linkDataArray[i2].from, arrows:'to', to: json.applicationMapData.linkDataArray[i2].to, length: 300,label:json.applicationMapData.linkDataArray[i2].totalCount});

                    }
                    var layoutMethod = "directed";


                    var data = {
                      nodes: nodes,
                      edges: edges
                    };
                    var options = {
                      layout: {
                        hierarchical: {
                          enabled:false,
                          sortMethod: layoutMethod,
                          direction:'LR',
                          nodeSpacing:500,
                          treeSpacing:600,
                          levelSeparation:300
                        }
                      },
                      nodes: node_default,
                      edges: {
                        font: {
                          size: scope.panel.fontsize,
                          color: labelcolor?'#DCDCDC':'#696969'
                        },
                        dashes:edges_default

                      },
                    };


                    var cache_call_relationship;
                    var max_call = parseInt(json.callStack[0][14]);
                    var callStackEdges_color = '#2b7ce9';
                    var callStackNodes_color = '#5ec6f7';
                    for(var i1=0;i1<json.callStack.length;i1++){

                      if(parseInt(json.callStack[i1][14])>0.5*max_call){
                        callStackEdges_color = '#F48A52';
                        callStackNodes_color = '#F48A52';
                        max_call=parseInt(json.callStack[i1][14]);
                      }else{
                        callStackEdges_color = '#2b7ce9';
                        callStackNodes_color = '#5ec6f7';
                      }
                      callStackNodes.push({id:json.callStack[i1][6], color:{background:callStackNodes_color},widthConstraint: { minimum: 120 },label: json.callStack[i1][10]});
                      callStackEdges.push({from: json.callStack[i1][7], arrows:'to', color:{color:callStackEdges_color},to: json.callStack[i1][6], length: 200,label:json.callStack[i1][14]+'ms'});
                      if(json.callStack[i1][5]===0){
                        call_relationship = "";
                      }else if(json.callStack[i1][5]===1){
                        call_relationship = "->"+json.callStack[i1][5];
                      }else if(json.callStack[i1][5]===2){
                        call_relationship = "-->"+json.callStack[i1][5];
                      }else if(json.callStack[i1][5]===3){
                        call_relationship = "--->"+json.callStack[i1][5];
                      }else if(json.callStack[i1][5]===4){
                        call_relationship = "---->"+json.callStack[i1][5];
                      }else if(json.callStack[i1][5]===5){
                        call_relationship = "----->"+json.callStack[i1][5];
                      }else if(json.callStack[i1][5]===6){
                        call_relationship = "------>"+json.callStack[i1][5];
                      }


                      // if(json.callStack[i1][5]==0){
                      //    call_relationship = "0";
                      // }else{
                      //   cache_call_relationship = json.callStack[i1][5]-1;
                      //   call_relationship =json.callStack[i1][5]+","+cache_call_relationship+ "->"+json.callStack[i1][5];
                      // }

                      scope.filteredItems[i1]={call_relationship:call_relationship,method:json.callStack[i1][10],parameter:json.callStack[i1][11],startTime:json.callStack[i1][12],interval:json.callStack[i1][13],timeConsumption:json.callStack[i1][14],methodConsumption:json.callStack[i1][16],belongsToClass:json.callStack[i1][17],api:json.callStack[i1][19],agent:json.callStack[i1][20],application:json.callStack[i1][4]};
                    }

                    var callStackData = {
                      nodes: callStackNodes,
                      edges: callStackEdges
                    };

                    var callStackOptions = {
                      edges: {

                        widthConstraint: {
                          maximum: 90
                        }
                      },
                      nodes: {
                        shape: 'box',
                        margin: 2,
                        widthConstraint: {
                          maximum: 150
                        }
                      },
                      layout: {
                        hierarchical: {
                          enabled:true,
                          sortMethod: layoutMethod,
                          nodeSpacing:150,
                          direction:'UD'
                        }
                      },
                      physics: {
                        enabled: false
                      }
                    };

                    //scope.filteredItem=[{name:"aaa",value:11},{name:"bbb",value:12},{name:"ccc",value:7},{name:"ddd",value:8}];
                    //scope.filteredItems=json.callStack;
                    //scope.groupToPages();
                    //dashboard.current.hbasedata = json;
                    //dashboard.current.network_force_refresh = false;
                    //scope.showChart(show_chart_url);


                    var network = new vis.Network(document.getElementById(idd+"a"), data, options);
                    var callStackNetwork = new vis.Network(document.getElementById(idd+"e"), callStackData, callStackOptions);
                    $.ajaxSettings.async = false;
                    $.getJSON(show_chart_url, function (json) {
                      scope.jvmdata = json;
                      //处理获得的数据，生成折线图
                      var jvm_xdata=[];
                      var jvm_maxdata=[];
                      var jvm_ydata=[];
                      var jvm_now_maxdata=[];
                      var jvm_now_ydata=[];
                      var cpu_load_system_ydata=[];
                      var cpu_load_jvm_ydata=[];
                      var jvm_memmory_use= scope.jvmdata.charts.JVM_MEMORY_HEAP_USED.points;
                      var jvm_max_memory_use = scope.jvmdata.charts.JVM_MEMORY_HEAP_MAX.points;
                      var jvm_memmory_now_use= scope.jvmdata.charts.JVM_MEMORY_NON_HEAP_USED.points;
                      var jvm_max_memory_now_use = scope.jvmdata.charts.JVM_MEMORY_NON_HEAP_MAX.points;
                      var cpu_load_jvm=scope.jvmdata.charts.CPU_LOAD_JVM.points;
                      var cpu_load_system=scope.jvmdata.charts.CPU_LOAD_SYSTEM.points;
                      for(var j1=0;j1<jvm_memmory_use.length;j1++){
                        jvm_xdata[j1] = new Date(jvm_memmory_use[j1].xVal).pattern("yyyy-MM-dd HH:mm:ss");
                        jvm_ydata[j1] = (jvm_memmory_use[j1].avgYVal/1024/1024).toFixed(2);
                        jvm_maxdata[j1] = (jvm_max_memory_use[j1].avgYVal/1024/1024).toFixed(2);
                        jvm_now_ydata[j1] = (jvm_memmory_now_use[j1].avgYVal/1024/1024).toFixed(2);
                        jvm_now_maxdata[j1] = (jvm_max_memory_now_use[j1].avgYVal/1024/1024).toFixed(2);
                        // if(cpu_load_jvm[j1].avgYVal>-1){
                        //   cpu_load_jvm_ydata[j1]=cpu_load_jvm[j1].avgYVal;
                        // }
                        // if(cpu_load_system[j1].avgYVal>-1){
                        //   cpu_load_system_ydata[j1]=cpu_load_system[j1].avgYVal;
                        // }
                        cpu_load_jvm_ydata[j1]=cpu_load_jvm[j1].avgYVal;
                        cpu_load_system_ydata[j1]=cpu_load_system[j1].avgYVal;
                      }
                      require(['echarts'], function(echarts) {
                        var option9 = {

                          tooltip: {
                            trigger: 'axis',
                            confine:true,
                            axisPointer: {
                              animation: false
                            }
                          },
                          color:['#1ab0f9','#38e52e'],
                          legend: {
                            textStyle:{
                              color:labelcolor?'#DCDCDC':'#696969'
                            },
                            data:["used","max"]
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

                          grid: {
                            left: '3%',
                            right: '4%',
                            bottom: '3%',
                            containLabel: true
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
                              data :jvm_xdata
                            }
                          ],
                          yAxis : [
                            {
                              type : 'value',
                              name : $translate.instant('Memory(M)'),
                              min :0,
                              nameTextStyle:{
                                color:labelcolor?'#DCDCDC':'#696969'
                              },
                              axisLine:{
                                lineStyle:{
                                  color:'#46474C'
                                }
                              },
                              splitLine:{
                                lineStyle:{
                                  color:['#46474C']
                                }
                              },
                              axisLabel:{
                                textStyle:{
                                  color:labelcolor?'#DCDCDC':'#696969'
                                }
                              }
                            }
                          ],
                          series : [{name:"used",type:'line',areaStyle: {normal: {opacity:0.6}},data: jvm_ydata},
                                    {name:"max",type:'line',data: jvm_maxdata}]
                        };
                        var option2 = {

                          tooltip: {
                            trigger: 'axis',
                            confine:true,
                            axisPointer: {
                              animation: false
                            }
                          },
                          color:['#1ab0f9','#38e52e'],
                          legend: {
                            textStyle:{
                              color:labelcolor?'#DCDCDC':'#696969'
                            },
                            data:["used","max"]
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

                          grid: {
                            left: '3%',
                            right: '4%',
                            bottom: '3%',
                            containLabel: true
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
                              data :jvm_xdata
                            }
                          ],
                          yAxis : [
                            {
                              type : 'value',
                              name : $translate.instant('Permanent state memory(M)'),
                              min :0,
                              nameTextStyle:{
                                color:labelcolor?'#DCDCDC':'#696969'
                              },
                              axisLine:{
                                lineStyle:{
                                  color:'#46474C'
                                }
                              },
                              splitLine:{
                                lineStyle:{
                                  color:['#46474C']
                                }
                              },
                              axisLabel:{
                                textStyle:{
                                  color:labelcolor?'#DCDCDC':'#696969'
                                }
                              }
                            }
                          ],
                          series : [{name:"used",type:'line',areaStyle: {normal: {opacity:0.6}},data: jvm_now_ydata},
                            {name:"max",type:'line',data: jvm_now_maxdata}]
                        };
                        var option3 = {

                          tooltip: {
                            trigger: 'axis',
                            confine:true,
                            axisPointer: {
                              animation: false
                            }
                          },
                          color:['#1ab0f9','#38e52e'],
                          legend: {
                            textStyle:{
                              color:labelcolor?'#DCDCDC':'#696969'
                            },
                            data:["JVM","System"]
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

                          grid: {
                            left: '3%',
                            right: '4%',
                            bottom: '3%',
                            containLabel: true
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
                              data :jvm_xdata
                            }
                          ],
                          yAxis : [
                            {
                              type : 'value',
                              name : 'CPU(%)',
                              min :0,
                              nameTextStyle:{
                                color:labelcolor?'#DCDCDC':'#696969'
                              },
                              axisLine:{
                                lineStyle:{
                                  color:'#46474C'
                                }
                              },
                              splitLine:{
                                lineStyle:{
                                  color:['#46474C']
                                }
                              },
                              axisLabel:{
                                textStyle:{
                                  color:labelcolor?'#DCDCDC':'#696969'
                                }
                              }
                            }
                          ],
                          series : [{name:"System",type:'line',areaStyle: {normal: {opacity:0.6}},data: cpu_load_system_ydata},
                            {name:"JVM",type:'line',areaStyle: {normal: {opacity:0.6}},data: cpu_load_jvm_ydata}]
                        };
                        if(myChart1) {
                          myChart1.dispose();
                        }
                        if(myChart2) {
                          myChart2.dispose();
                        }
                        if(myChart3) {
                          myChart3.dispose();
                        }
                        myChart1 = echarts.init(document.getElementById(idd+"b"));
                        myChart1.setOption(option9);
                        myChart2 = echarts.init(document.getElementById(idd+"c"));
                        myChart2.setOption(option2);
                        myChart3 = echarts.init(document.getElementById(idd+"d"));
                        myChart3.setOption(option3);
                      });

                      // var option8 = {
                      //   tooltip: {
                      //     trigger: 'item',
                      //     formatter: "{a} <br/>{b}: {c} ({d}%)"
                      //   },
                      //   legend: {
                      //     orient: 'vertical',
                      //     x: 'left',
                      //     data:['直接访问','邮件营销','联盟广告','视频广告','搜索引擎']
                      //   },
                      //   series: [
                      //     {
                      //       name:'访问来源',
                      //       type:'pie',
                      //       radius: ['50%', '70%'],
                      //       avoidLabelOverlap: false,
                      //       label: {
                      //         normal: {
                      //           show: false,
                      //           position: 'center'
                      //         },
                      //         emphasis: {
                      //           show: true,
                      //           textStyle: {
                      //             fontSize: '30',
                      //             fontWeight: 'bold'
                      //           }
                      //         }
                      //       },
                      //       labelLine: {
                      //         normal: {
                      //           show: false
                      //         }
                      //       },
                      //       data:[
                      //         {value:335, name:'直接访问'},
                      //         {value:310, name:'邮件营销'},
                      //         {value:234, name:'联盟广告'},
                      //         {value:135, name:'视频广告'},
                      //         {value:1548, name:'搜索引擎'}
                      //       ]
                      //     }
                      //   ]
                      // };
                      // myChart1 = echarts.init(document.getElementById("bbb"));
                      // myChart1.setOption(option8);

                    });
                    $.ajaxSettings.async = true;

                  });
                  $.ajaxSettings.async = true;
                  $('#ibox1').toggleClass('sk-loading');
                  scope.$emit('render');

                }, function errorCallback(response) {
                  // 请求失败执行代码
                });
                // $http.post(post_url, demo_data).then(function successCallback(response) {
                //   // 请求成功执行代码
                //   var post = response;
                // }, function errorCallback(response) {
                //   // 请求失败执行代码
                // });
                //scope.build_search(params);

              });
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
