define([
  'angular',
  'jquery',

  'kbn',
  'underscore',
  'config',
  'moment',
  'modernizr',
  'filesaver',
  'html2canvas',
  'cookies',
  'toastr',
    'confirm',
  'sweetalert'
],
function (angular, $, kbn, _, config, moment, Modernizr) {
  'use strict';
  var toastr = require('toastr');
  toastr.options = {
    closeButton: true,
    progressBar: true,
    showMethod: 'slideDown',
    showEasing: "swing",
    timeOut: 3000
  };

  // setTimeout(function() {
  //   toastr.options = {
  //     closeButton: true,
  //     progressBar: true,
  //     showMethod: 'slideDown',
  //     timeOut: 5000
  //   };
  //   toastr.info('Responsive Admin Theme', 'Welcome to RealsightAPM');
  //
  // }, 1000);
  var DEBUG = false; // DEBUG mode

  var module = angular.module('kibana.services');

  module.service('dashboard', function($routeParams, $http, $rootScope, $injector, $location,$translate,
    sjsResource, timer, kbnIndex, alertSrv,SweetAlert
  ) {
    // A hash of defaults to use when loading a dashboard
    var _dash = {
      title: "",
      language:1,
      style: "dark",
      isstyle: "dark",
      editable: true,
        headHide:true,
        row_controller:true,
        searchEnable:false,
        searchID:0,
        isSearch:false,
        mute:false,
      failover: false,
      en_cn:false,
      alarm:false,
      network_app_name:'',
      show_delete_template:false,
      template_server:config.solr,
      switch:"App_Demo_Operate",
      panel_hints: true,
      hide_head: false,
      load:true,
      enable_linkage:true,
      linkage_id:'a',
      template:[],
      rows: [],
      services: {},
      loader: {
        dropdown_collections: false,
        save_gist: true,
        save_elasticsearch: true,
        save_local: true,
        save_default: true,
        save_temp: true,
        save_temp_ttl_enable: true,
        save_temp_ttl: '30d',
        load_gist: true,
        load_elasticsearch: true,
        load_elasticsearch_size: 10,
        load_local: true,
        hide: false
      },
      index: {
        interval: 'none', // this will always be none because we disable 'Index Settings' tab in dasheditor.html
        pattern: '_all',  // TODO: Remove it
        default: 'INDEX_MISSING'
      },
      solr: {
        server: config.solr,
        core_name: config.solr_core,
        core_list: [],
        global_params: ''
      }
    };

    var sjs = sjsResource(config.solr + config.solr_core);

    var gist_pattern = /(^\d{5,}$)|(^[a-z0-9]{10,}$)|(gist.github.com(\/*.*)\/[a-z0-9]{5,}\/*$)/;

    // Store a reference to this
    var self = this;
    var filterSrv,querySrv;

    this.current = _.clone(_dash);
    this.last = {};
    this.template=[];
    this.topology = {
      network_force_refresh:true,
    };

    $rootScope.$on('$routeChangeSuccess',function(){
      // Clear the current dashboard to prevent reloading
      self.current = {};
      self.indices = [];
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


      route();

    });

    var route = function() {
      // Is there a dashboard type and id in the URL?
      setTimeout(function() {
        self.solr_list('*:*',100);
      }, 3000);

      if(!(_.isUndefined($routeParams.kbnType)) && !(_.isUndefined($routeParams.kbnId))) {
        var _type = $routeParams.kbnType;
        var _id = $routeParams.kbnId;

        switch(_type) {
        case ('elasticsearch'):
          self.elasticsearch_load('dashboard',_id);
          break;
        case ('solr'):
          self.elasticsearch_load('dashboard',_id);
          break;
        case ('temp'):
          self.elasticsearch_load('temp',_id);
          break;
        case ('file'):
          self.file_load(_id);
          break;
        case('script'):
          self.script_load(_id);
          break;
        default:
          self.file_load('default.json');
        }

      // No dashboard in the URL
      } else {
        // Check if browser supports localstorage, and if there's a dashboard
        if (Modernizr.localstorage &&
          !(_.isUndefined(window.localStorage['dashboard'])) &&
          window.localStorage['dashboard'] !== ''
        ) {
          var dashboard = JSON.parse(window.localStorage['dashboard']);
          self.dash_load(dashboard);
        // No? Ok, grab default.json, its all we have now
        } else {
          self.file_load('default.json');
        }
      }
      //require(['toastr'], function(toastr){

      //});
    };

    // Since the dashboard is responsible for index computation, we can compute and assign the indices
    // here before telling the panels to refresh
    this.refresh = function() {

        self.current.filterids = filterSrv.ids;
      // Retrieve Solr collections for the dashboard
      kbnIndex.collections(self.current.solr.server).then(function (p) {
        if (DEBUG) { console.debug('dashboard: kbnIndex.collections p = ',p); }
        if (p.length > 0) {
          self.current.solr.core_list = p;
        }
        // } else {
        //   // No collections returned from Solr
        //   // Display alert only if USE_ADMIN_CORES flag in config.js is true.
        //   if (config.USE_ADMIN_CORES) {
        //   //   //alertSrv.set('No collections','There were no collections returned from Solr.','info',5000);
        //   // }
        // }
      });

      if(self.current.index.interval !== 'none') {
        if(filterSrv.idsByType('time').length > 0) {
          var _range = filterSrv.timeRange('min');
          kbnIndex.indices(_range.from,_range.to,
            self.current.index.pattern,self.current.index.interval
          ).then(function (p) {
            if (DEBUG) { console.debug('dashboard: p = ',p); }

            if(p.length > 0) {
              self.indices = p;
            } else {
              // Option to not failover
              if(self.current.failover) {
                self.indices = [self.current.index.default];
              } else {
                // Do not issue refresh if no indices match. This should be removed when panels
                // properly understand when no indices are present
                toastr.info($translate.instant('No results'), 'RealsightAPM');
                return false;
              }
            }

            $rootScope.$broadcast('refresh');
          });
        } else {
          if(self.current.failover) {
            self.indices = [self.current.index.default];
            $rootScope.$broadcast('refresh');
          } else {
            toastr.info($translate.instant('No time filter'), 'RealsightAPM');
          }
        }
      } else {
        self.indices = [self.current.index.default];
        $rootScope.$broadcast('refresh');
      }

      if (DEBUG) { console.debug('dashboard: after refresh',self); }
    };


    var dash_defaults = function(dashboard) {
      _.defaults(dashboard,_dash);
      _.defaults(dashboard.index,_dash.index);
      _.defaults(dashboard.loader,_dash.loader);
      // Solr
      _.defaults(dashboard.collection,_dash.collection);
      return dashboard;
    };

    this.dash_load = function(dashboard) {
      // Cancel all timers
      timer.cancel_all();

      // update browser window/tab title to reflect current dashboard's title
      document.title = dashboard.title;

      // Make sure the dashboard being loaded has everything required
      dashboard = dash_defaults(dashboard);

      // If not using time based indices, use the default index
      if(dashboard.index.interval === 'none') {
        self.indices = [dashboard.index.default];
      }

      self.current = _.clone(dashboard);

      // Ok, now that we've setup the current dashboard, we can inject our services
      querySrv = $injector.get('querySrv');
      filterSrv = $injector.get('filterSrv');

      // Make sure these re-init
      querySrv.init();
      filterSrv.init();

      // If there's an index interval set and no existing time filter, send a refresh to set one
      if(dashboard.index.interval !== 'none' && filterSrv.idsByType('time').length === 0) {
        self.refresh();
      }

      return true;
    };

    this.gist_id = function(string) {
      if(self.is_gist(string)) {
        return string.match(gist_pattern)[0].replace(/.*\//, '');
      }
    };

      this.page_switch = function(string) {

          return $http({
              url: "app/dashboards/" + string + '?' + new Date().getTime(),
              method: "GET",
              transformResponse: function (response) {
                  return renderTemplate(response, $routeParams);
              }
          }).then(function (result) {
              if (!result) {
                  return false;
              }
              self.dash_load(dash_defaults(result.data));
              return true;
          }, function () {
            toastr.error($translate.instant('Could not load dashboards'), 'RealsightAPM');
              return false;
          });
      };

    this.is_gist = function(string) {
      if(!_.isUndefined(string) && string !== '' && !_.isNull(string.match(gist_pattern))) {
        return string.match(gist_pattern).length > 0 ? true : false;
      } else {
        return false;
      }
    };
    this.is_refresh = function(){
        if (self.current.style !== self.current.isstyle){
         self.refresh();
         self.current.isstyle = self.current.style;
        }
    };

    this.clear_cookie = function(){
      $.cookie("rtd_username", null);
      $.cookie("rtd_password", null);
      location.reload();
    };


      this.remove = function() {
          var ids = self.current.filterids;
          if(self.current.isSearch){
            if(self.current.searchID === ids[ids.length-1]){
              filterSrv.remove(self.current.searchID);
              self.current.isSearch  = false;
                self.refresh();}else{
                filterSrv.remove(ids.length-1);
                self.refresh();
            }
          }else{
          if (ids[ids.length-1] !== 0){
              filterSrv.remove(ids[ids.length-1]);
              self.refresh();}else
                {
                  if(ids.length>1)
                  {
                      filterSrv.remove(ids[ids.length-2]);
                      self.refresh();
                  }
          }
          }
      };



    this.to_file = function() {
      var blob = new Blob([angular.toJson(self.current,true)], {type: "text/json;charset=utf-8"});
      // from filesaver.js
      window.saveAs(blob, self.current.title+"-"+new Date().getTime());
      return true;
    };
      this.color_change = function(){
        if(self.current.style === 'blue'){
            document.getElementById('setting').style.background='#f5f5f5';
        }else if(self.current.style === 'dark'||self.current.style === 'black'){
            document.getElementById('setting').style.background='#52575c';
        }else{
            document.getElementById('setting').style.background='#c1c1c1';
        }

      };


    this.set_default = function(dashboard) {
      if (Modernizr.localstorage) {
        window.localStorage['dashboard'] = angular.toJson(dashboard || self.current);
        $location.path('/dashboard');
        toastr.options = {
          closeButton: true,
          progressBar: true,
          showMethod: 'slideDown',
          showEasing: "swing",
          timeOut: 3000
        };
        toastr.success($translate.instant('Local default template set successfully'), 'RealsightAPM');
        //alertSrv.set('Local Default Set',self.current.title+' has been set as your local default','success',5000);
      } else {
        toastr.error($translate.instant('Local default template set failed'), 'RealsightAPM');
        //alertSrv.set('Incompatible Browser','Sorry, your browser is too old for this feature','error',5000);
      }
    };

    this.purge_default = function() {
      if (Modernizr.localstorage) {
        window.localStorage['dashboard'] = '';
        toastr.success($translate.instant('Local default template clear successfully'), 'RealsightAPM');
        //alertSrv.set('Local Default Clear','Your local default dashboard has been cleared','success',5000);

      } else {
        toastr.error($translate.instant('Local default template clear failed'), 'RealsightAPM');
        //alertSrv.set('Incompatible Browser','Sorry, your browser is too old for this feature','error',5000);
      }
    };


    // TOFIX: Pretty sure this breaks when you're on a saved dashboard already
    this.share_link = function(title,type,id) {
      return {
        location  : window.location.href.replace(window.location.hash,""),
        type      : type,
        id        : id,
        link      : window.location.href.replace(window.location.hash,"")+"#dashboard/"+type+"/"+id,
        title     : title
      };
    };

    var renderTemplate = function(json,params) {
      var _r;
      _.templateSettings = {interpolate : /\{\{(.+?)\}\}/g};
      var template = _.template(json);
      var rendered = template({ARGS:params});
      try {
        _r = angular.fromJson(rendered);
      } catch(e) {
        _r = false;
      }
      return _r;
    };

    this.file_load = function(file) {
      return $http({
        url: "app/dashboards/"+file+'?' + new Date().getTime(),
        method: "GET",
        transformResponse: function(response) {
          return renderTemplate(response,$routeParams);
        }
      }).then(function(result) {
        if(!result) {
          return false;
        }
        self.dash_load(dash_defaults(result.data));
        return true;
      },function() {
        toastr.error($translate.instant('Could not load dashboards'), 'RealsightAPM');
        return false;
      });
    };

    this.elasticsearch_load = function(type,id) {
      var server = $routeParams.server || config.solr;
      return $http({
        url: server + config.banana_index + '/select?wt=json&q=title:"' + id + '"',
        method: "GET",
        transformResponse: function(response) {
          response = angular.fromJson(response);
          var source_json = angular.fromJson(response.response.docs[0].dashboard);

          if (DEBUG) { console.debug('dashboard: type=',type,' id=',id,' response=',response,' source_json=',source_json); }

          // return renderTemplate(angular.fromJson(response)._source.dashboard, $routeParams);
          // return renderTemplate(JSON.stringify(source_json.dashboard), $routeParams);
          return renderTemplate(JSON.stringify(source_json), $routeParams);
        }
      }).then(
        function successCallback(data) {
          // this callback will be called asynchronously
          // when the response is available
          self.dash_load(data.data);
        },
        function errorCallback(data, status) {
          // called asynchronously if an error occurs
          // or server returns response with an error status.
          if(status === 0) {
            alertSrv.set('Error',"Could not contact Solr at "+config.solr+
              ". Please ensure that Solr is reachable from your system." ,'error');
          } else {
            alertSrv.set('Error','Could not find dashboard named "'+id+'". Please ensure that the dashboard name is correct or exists in the system.','error');
          }
          return false;
        }
      );
        // .error(function(data, status) {
        // if(status === 0) {
        //   alertSrv.set('Error',"Could not contact Solr at "+config.solr+
        //     ". Please ensure that Solr is reachable from your system." ,'error');
        // } else {
        //   alertSrv.set('Error','Could not find dashboard named "'+id+'". Please ensure that the dashboard name is correct or exists in the system.','error');
        // }
        // return false;
      // }).success(function(data) {
      //   self.dash_load(data);
      // });
    };

    this.script_load = function(file) {
      return $http({
        url: "app/dashboards/"+file,
        method: "GET",
        transformResponse: function(response) {
          /*jshint -W054 */
          var _f = new Function('ARGS','kbn','_','moment','window','document','angular','require','define','$','jQuery',response);
          return _f($routeParams,kbn,_,moment);
        }
      }).then(function(result) {
        if(!result) {
          return false;
        }
        self.dash_load(dash_defaults(result.data));
        return true;
      },function() {
        alertSrv.set('Error',
          "Could not load <i>scripts/"+file+"</i>. Please make sure it exists and returns a valid dashboard" ,
          'error');
        return false;
      });
    };

    this.elasticsearch_save = function(type,title,ttl) {
      // Clone object so we can modify it without influencing the existing obejct
      var save = _.clone(self.current);
      var id;

      // Change title on object clone
      if (type === 'dashboard') {
        id = save.title = _.isUndefined(title) ? self.current.title : title;
      }

      // Create request with id as title. Rethink this.
      // Use id instead of _id, because it is the default field of Solr schema-less.
      var request = sjs.Document(config.banana_index,type,id).source({
        // _id: id,
        id: id,
        user: 'guest',
        group: 'guest',
        title: save.title,
        dashboard: angular.toJson(save)
      });

      request = type === 'temp' && ttl ? request.ttl(ttl) : request;

      // Solr: set sjs.client.server to use 'banana-int' for saving dashboard
      var solrserver = self.current.solr.server + config.banana_index || config.solr + config.banana_index;
      sjs.client.server(solrserver);

      return request.doIndex(
        // Success
        function(result) {
          if(type === 'dashboard') {
            // TODO
           // self.elasticsearch_load(type,id);
            //$location.url('/dashboard/solr/'+title+'?server='+self.current.solr.server);
          }
          return result;
        },
        // Failure
        function() {
          return false;
        }
      );
    };

    this.elasticsearch_delete = function(id) {
      // Set sjs.client.server to use 'banana-int' for deleting dashboard
      var solrserver = self.current.solr.server + config.banana_index || config.solr + config.banana_index;
      sjs.client.server(solrserver);

      return sjs.Document(config.banana_index,'dashboard',id).doDelete(
        // Success
        function(result) {
          return result;
        },
        // Failure
        function() {
          return false;
        }
      );
    };

    this.solr_delete = function(id) {
      // Set sjs.client.server to use 'banana-int' for deleting dashboard
      var solrserver = self.current.template_server + config.banana_index || config.solr + config.banana_index;
      sjs.client.server(solrserver);

      return sjs.Document(config.banana_index,'dashboard',id).doDelete(
        // Success
        function(result) {
          toastr.options = {
            closeButton: true,
            progressBar: true,
            showMethod: 'slideDown',
            showEasing: "swing",
            timeOut: 3000
          };
          toastr.success($translate.instant('Delete template successfully'), 'RealsightAPM');
          //alertSrv.set($translate.instant('Delete template successfully'),self.current.title+' has been deleted','success',5000);
          self.solr_list('*:*',100);
          return result;
        },
        // Failure
        function() {
          toastr.options = {
            closeButton: true,
            progressBar: true,
            showMethod: 'slideDown',
            showEasing: "swing",
            timeOut: 3000
          };
          toastr.error($translate.instant('Delete template failed'), 'RealsightAPM');
          //alertSrv.set($translate.instant('Delete template failed'),self.current.title+' has been deleted','error',5000);
          return false;
        }
      );
    };
    this.solr_list = function(query,count) {
      // set indices and type
      var solrserver = self.current.template_server + config.banana_index || config.solr + config.banana_index;
      sjs.client.server(solrserver);

      var request = sjs.Request().indices(config.banana_index).types('dashboard');

      // Need to set sjs.client.server back to use 'logstash_logs' collection
      // But cannot do it here, it will interrupt other modules.
      // sjs.client.server(config.solr);

      return request.query(
        sjs.QueryStringQuery(query || '*:*')
      ).size(count).doSearch(
        // Success
        function(result) {
          var data =[];
          for(var i=0;i<result.response.numFound;i++){
            data[i] = result.response.docs[i].title;
          }
          self.template =data;
          toastr.options = {
            closeButton: true,
            progressBar: true,
            showMethod: 'slideDown',
            showEasing: "swing",
            timeOut: 3000
          };
          toastr.success($translate.instant('List template successfully'), 'RealsightAPM');
          //alertSrv.set($translate.instant('List template successfully'),'Template has been listed','success',5000);
          return data;
        },
        // Failure
        function() {
          toastr.options = {
            closeButton: true,
            progressBar: true,
            showMethod: 'slideDown',
            timeOut: 4000
          };
          toastr.warning($translate.instant('List template failed'), 'RealsightAPM');
          //alertSrv.set($translate.instant('List template failed'),'Templates have been not listed','error',5000);
          return false;
        }
      );

    };
    this.solr_load = function(type,id) {
      var server =self.current.template_server;
      return $http({
        url: server + config.banana_index + '/select?wt=json&q=title:"' + id + '"',
        method: "GET",
        transformResponse: function(response) {
          response = angular.fromJson(response);
          var source_json = angular.fromJson(response.response.docs[0].dashboard);

          if (DEBUG) { console.debug('dashboard: type=',type,' id=',id,' response=',response,' source_json=',source_json); }

          // return renderTemplate(angular.fromJson(response)._source.dashboard, $routeParams);
          // return renderTemplate(JSON.stringify(source_json.dashboard), $routeParams);
          return renderTemplate(JSON.stringify(source_json), $routeParams);
        }
      }).then(
        function successCallback(data) {
          // this callback will be called asynchronously
          // when the response is available
          self.dash_load(data.data);
        },
        function errorCallback(data, status) {
          // called asynchronously if an error occurs
          // or server returns response with an error status.

          toastr.options = {
            closeButton: true,
            progressBar: true,
            showMethod: 'slideDown',
            showEasing: "swing",
            timeOut: 3000
          };
          toastr.error($translate.instant('Load template failed'), 'RealsightAPM');
          // if(status === 0) {
          //   alertSrv.set('Error:'+"Could not contact template system at "+self.current.template_server,
          //     "Please ensure that Solr is reachable from your system." ,'error');
          // } else {
          //   alertSrv.set('Error:'+'Could not find dashboard named '+id,' Please ensure that the dashboard name is correct or exists in the system.','error');
          // }
          return false;
        }
      );
      // .error(function(data, status) {
      // if(status === 0) {
      //   alertSrv.set('Error',"Could not contact Solr at "+config.solr+
      //     ". Please ensure that Solr is reachable from your system." ,'error');
      // } else {
      //   alertSrv.set('Error','Could not find dashboard named "'+id+'". Please ensure that the dashboard name is correct or exists in the system.','error');
      // }
      // return false;
      // }).success(function(data) {
      //   self.dash_load(data);
      // });
    };
    this.solr_save = function(type,title,ttl) {
      // Clone object so we can modify it without influencing the existing obejct
      var save = _.clone(self.current);
      var id;

      // Change title on object clone
      if (type === 'dashboard') {
        id = save.title = _.isUndefined(title) ? self.current.title : title;
      }

      // Create request with id as title. Rethink this.
      // Use id instead of _id, because it is the default field of Solr schema-less.
      var request = sjs.Document(config.banana_index,type,id).source({
        // _id: id,
        id: id,
        user:  $.cookie('rtd_username'),
        group: 'apm',
        title: save.title,
        dashboard: angular.toJson(save)
      });

      request = type === 'temp' && ttl ? request.ttl(ttl) : request;

      // Solr: set sjs.client.server to use 'banana-int' for saving dashboard
      var solrserver = self.current.template_server + config.banana_index || config.solr + config.banana_index;
      sjs.client.server(solrserver);

      return request.doIndex(
        // Success
        function(result) {
          if(type === 'dashboard') {
            // TODO
            toastr.options = {
              closeButton: true,
              progressBar: true,
              showMethod: 'slideDown',
              showEasing: "swing",
              timeOut: 3000
            };
            toastr.success($translate.instant('Store template successfully'), 'RealsightAPM');
            self.solr_list('*:*',100);
            //alertSrv.set($translate.instant('Store template successfully'),self.current.title+' has been store to solr','success',5000);
            // self.elasticsearch_load(type,id);
            //$location.url('/dashboard/solr/'+title+'?server='+self.current.solr.server);
          }
          return result;
        },
        // Failure
        function() {
          toastr.options = {
            closeButton: true,
            progressBar: true,
            showMethod: 'slideDown',
            showEasing: "swing",
            timeOut: 3000
          };
          toastr.error($translate.instant('Store template failed'), 'RealsightAPM');
         // alertSrv.set($translate.instant('Store template failed'),self.current.title+' has been store to solr','error',5000);
          return false;
        }
      );
    };


    this.elasticsearch_list = function(query,count) {
      // set indices and type
      var solrserver = self.current.solr.server + config.banana_index || config.solr + config.banana_index;
      sjs.client.server(solrserver);

      var request = sjs.Request().indices(config.banana_index).types('dashboard');

      // Need to set sjs.client.server back to use 'logstash_logs' collection
      // But cannot do it here, it will interrupt other modules.
      // sjs.client.server(config.solr);

      return request.query(
        sjs.QueryStringQuery(query || '*:*')
        ).size(count).doSearch(
          // Success
          function(result) {
            return result;
          },
          // Failure
          function() {
            return false;
          }
        );

    };
    this.save_pdf = function() {
      $(".theme-config-box").toggleClass("show");
        var background_color = '#272b30';
          if(self.current.style === 'blue'){
              background_color = '#5bc0de';
          }else if(self.current.style === 'light'){
              background_color = '#fff';
          }
              html2canvas(document.getElementById("bodyContent"), {
              background:background_color,

              // 渲染完成时调用，获得 canvas
              onrendered: function(canvas) {
                  var h =document.body.scrollHeight;
                  // 从 canvas 提取图片数据
                  var imgData = canvas.toDataURL('image/png');
                  var doc = new jsPDF("p", "mm", "a3");
                  //                               |
                  // |—————————————————————————————|
                  // A0 841×1189
                  // A1 594×841
                  // A2 420×594
                  // A3 297×420
                  // A4 210×297
                  // A5 148×210
                  // A6 105×148
                  // A7 74×105
                  // A8 52×74
                  // A9 37×52
                  // A10 26×37
                  //     |——|———————————————————————————|
                  //                                 |——|——|
                  //                                 |     |
                doc.addImage(imgData, 'PNG', 0, 0,297,h/5.5);
                if(h>2340){
                  doc.addPage();
                  doc.addImage(imgData, 'PNG', 0, -425,297,h/5.5);
                }
                if(h>4680){
                  doc.addPage();
                  doc.addImage(imgData, 'PNG', 0, -850,297,h/5.5);
                }
                if(h>7020){
                  doc.addPage();
                  doc.addImage(imgData, 'PNG', 0, -1275,297,h/5.5);
                }
                doc.save('content.pdf');
              }
          });
      };

    this.save_pdf_f2 = function() {
      var background_color = '#272b30';
      if(self.current.style === 'blue'){
        background_color = '#5bc0de';
      }else if(self.current.style === 'light'){
        background_color = '#fff';
      }
      html2canvas(document.getElementById("bodyContent"), {
        background:background_color,

        // 渲染完成时调用，获得 canvas
        onrendered: function(canvas) {
          var h =document.body.scrollHeight;
          // 从 canvas 提取图片数据
          var imgData = canvas.toDataURL('image/png');
          var doc = new jsPDF("p", "mm", "a3");
          //                               |
          // |—————————————————————————————|
          // A0 841×1189
          // A1 594×841
          // A2 420×594
          // A3 297×420
          // A4 210×297
          // A5 148×210
          // A6 105×148
          // A7 74×105
          // A8 52×74
          // A9 37×52
          // A10 26×37
          //     |——|———————————————————————————|
          //                                 |——|——|
          //                                 |     |
          doc.addImage(imgData, 'PNG', 0, 0,297,h/5.5);
          if(h>2340){
            doc.addPage();
            doc.addImage(imgData, 'PNG', 0, -425,297,h/5.5);
          }
          if(h>4680){
            doc.addPage();
            doc.addImage(imgData, 'PNG', 0, -850,297,h/5.5);
          }
          if(h>7020){
            doc.addPage();
            doc.addImage(imgData, 'PNG', 0, -1275,297,h/5.5);
          }
          doc.save('content.pdf');
        }
      });
    };

    this.save_gist = function(title,dashboard) {
      var save = _.clone(dashboard || self.current);
      save.title = title || self.current.title;
      return $http({
        url: "https://api.github.com/gists",
        method: "POST",
        data: {
          "description": save.title,
          "public": false,
          "files": {
            "banana-dashboard.json": {
              "content": angular.toJson(save,true)
            }
          }
        }
      }).then(function(data) {
        return data.data.html_url;
      }, function() {
        return false;
      });
    };

    this.gist_list = function(id) {
      return $http.jsonp("https://api.github.com/gists/"+id+"?callback=JSON_CALLBACK"
      ).then(function(response) {
        var files = [];
        _.each(response.data.data.files,function(v) {
          try {
            var file = JSON.parse(v.content);
            files.push(file);
          } catch(e) {
            return false;
          }
        });
        return files;
      }, function() {
        return false;
      });
    };
    this.confirm = function(){
      $.confirm({
        boxWidth: '30%',
        useBootstrap: false,
        type:'blue',
        theme:'material',
        icon:'icon icon-cloud-upload',
        title: $translate.instant('Save Template'),
        content: $translate.instant('Are you sure to continue?'),
        autoClose: 'NO|10000',
        buttons: {
          Yes: {
            btnClass: 'btn-success custom-class',
            action: function () {
              self.solr_save('dashboard',self.current.title);
            }
          },
          NO: {
            text: 'cancel'
          }
        }
      });
    }

    this.confirm_delete = function(id){
      if(id!=null){
        $.confirm({
          boxWidth: '30%',
          useBootstrap: false,
          type:'blue',
          theme:'material',
          icon:'icon icon-minus',
          title: $translate.instant('Template Delete'),
          content: $translate.instant('Are you sure to delete?'),
          autoClose: 'NO|10000',
          buttons: {
            Yes: {
              btnClass: 'btn-success custom-class',
              action: function () {
                self.solr_delete(id);
              }
            },
            NO: {
              text: 'cancel'
            }
          }
        });
        // SweetAlert.swal({
        //     title: "Are you sure?",
        //     text: "Your will not be able to recover this imaginary file!",
        //     type: "warning",
        //     showCancelButton: true,
        //     confirmButtonColor: "#DD6B55",
        //     confirmButtonText: "Yes, delete it!",
        //     closeOnConfirm: false},
        //   function(){
        //     SweetAlert.swal("Booyah!");
        //   });

      }

    }

    this.numberWithCommas = function(x) {
      if (x) {
        return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      } else {
        return x;
      }
    };

  });

});
