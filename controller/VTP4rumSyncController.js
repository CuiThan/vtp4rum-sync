var express = require('express');
var router = express.Router();
var bodyParser = require('body-parser');
var Setting = require('../common/Setting')

var request = require('request');
var requestPromise = require('request-promise');

var ScheduleJob = require('../dao/ScheduleJob');
var Employee = require('../dao/Employee');
var Organization = require('../dao/Organization');

var requetToken = function ( callback, resCallback) {
    var  jsonBody = {
        'grant_type': Setting.VT_GRANT_TYPE,
        'client_id' : Setting.VT_CLIENT_ID,
        'client_secret' : Setting.VT_CLIENT_SECRET,
        'username' : Setting.VT_USERNAME,
        'password' : Setting.VT_PASSWORD
    };

    var options = {
        uri: Setting.VT_REQUEST_TOKEN,
        method : 'POST',
        headers: {
            'User-Agent': 'Request-Promise'
        },
        json: true, // Automatically parses the JSON string in the response
        form : jsonBody,
    };

    request(options, function (error, response, body) {
        if (error == undefined || error == null){

            if (response.statusCode == 200) {
                if (callback != undefined && callback != null) {
                    resCallback.token = body.access_token;
                    callback(resCallback);
                };
            }
        };
    });
};

var getEmployeePaging = function(res) {

    var options = {
        uri: Setting.VT_GET_EMPLOYEE + '?sync_time' + res.resSyncTime + '&organization_id='+ Setting.VT_ORG_ID + '&page=' +res.page + '&per_page=' + res.perPage,
        headers: {
            'User-Agent': 'Request-Promise',
            'Authorization' : 'bearer ' + res.token
        },
        method : 'GET',
        json: true // Automatically parses the JSON string in the response
    };

    request(options,function (error, response) {
        if (response.body.metadata != undefined && response.body.metadata != null){
            totalPages = response.body.metadata.totalPages;
            processEmployee(response.body);
            if (totalPages > res.page){
                var newRequest = res;
                newRequest.page = res.page + 1;
                requetToken(getEmployeePaging,newRequest);
            };
        };
    });
};

var processEmployee = function(res){
    if (res.content != undefined){
        if (res.content.length > 0){

            var update = [];
            for (let i = 0; i < res.content.length; i++) {
                Employee.findOne({employeeId : res.content[i].employeeId}, function(error, result) {
                    if (error) return;
                    // if not exist then add & create account
                    if (result == null) {
                        var item = res.content[i];
                        item.vtpLastupdate = new Date();

                        if (item.email != null){
                            //create 4rumacc
                            var jsonBody = {
                                _uid: 1,
                                username : item.email.replace(/@[^@]+$/, ''),
                                password : item.email,
                                email : item.email
                            }
                            requestPromise({
                                url: Setting.FORUM_CREATE_USER_URL,
                                method: "POST",
                                headers: {
                                    'User-Agent': 'Request-Promise',
                                    'Authorization' : Setting.FORUM_TOKEN
                                },
                                json: true,   // <--Very important!!!
                                body: jsonBody
                            })
                                .then(function (repos) {
                                    if (repos.code != undefined && repos.code == 'ok'){
                                        item.forumCode = repos.payload.uid;
                                        item.vtpLastUpdate = new Date();

                                        Employee.create(item, function (err, employee) {
                                            console.log('created', employee);
                                        });
                                    };
                                })
                                .catch(function (err) {
                                    item.vtpLastUpdate = new Date();

                                    Employee.create(item, function (err, employee) {
                                        console.log('created', employee);
                                    });

                                    var errMsg = new Object();
                                    errMsg.name = err.name;
                                    errMsg.statusCode = err.statusCode;
                                    errMsg.message = err.message;
                                    errMsg.error = err.error;
                                });
                        }
                        else {
                            item.vtpLastUpdate = new Date();

                            Employee.create(item, function (err, employee) {
                                console.log('created', employee);
                            });
                        };
                    }
                    else {
                        var item = res.content[i];
                        item.vtpLastupdate = new Date();
                        if (item.email != null){
                            requestPromise({
                                url: Setting.FORUM_GET_ACCOUNT + item.email.replace(/@[^@]+$/, ''),
                                method: "GET",
                                headers: {
                                    'User-Agent': 'Request-Promise',
                                    'Authorization' : Setting.FORUM_TOKEN
                                },
                                json: true,   // <--Very important!!!
                                body : {
                                    _uid : 1
                                }
                            })
                                .then(function (repos) {
                                    if (repos.uid != undefined && repos.repos.uid > 0){
                                        item.forumCode = repos.uid;
                                        item.vtpLastUpdate = new Date();

                                        //check if do not has 4rum account them create new
                                        Employee.update(item, function (err, employee) {
                                            console.log('updated', employee);
                                        });
                                    };
                                })
                                .catch(function (err) {
                                    item.vtpLastUpdate = new Date();

                                    //check if do not has 4rum account them create new
                                    Employee.update(item, function (err, employee) {
                                        console.log('updated', employee);
                                    });

                                    var errMsg = new Object();
                                    errMsg.name = err.name;
                                    errMsg.statusCode = err.statusCode;
                                    errMsg.message = err.message;
                                    errMsg.error = err.error;
                                });
                        };


                    };
                });
            };
        };
    };
};

var syncEmployee = function () {
    //get last run time
    var lastRuntime = new Date();
    lastRuntime.setDate(lastRuntime.getDate() - 36500);
    var find = false;

    ScheduleJob.find({}, function (err, scheduleJob) {
        if (err) return;

        if (scheduleJob !=null && scheduleJob.length > 0) {
            lastRuntime = scheduleJob[0].lastRuntime;
            find = true;
        }
        if (!find){
            //if first run then insert to db
            ScheduleJob.create({
                jobType : Setting.VT_SYNC_EMPLOYEE,
                lastRuntime : new Date()
            });
        }
        else {
            //update
            scheduleJob[0].lastRuntime = new Date();

            ScheduleJob.update({_id : scheduleJob[0]._id}, scheduleJob[0],function(err,updated){
            });
        }

        var requestEmployee = new Object();
        requestEmployee.page = 1;
        requestEmployee.perPage = 5;
        requestEmployee.resSyncTime = lastRuntime.getTime();

        requetToken(getEmployeePaging, requestEmployee);


    }).where('jobType').in([Setting.VT_SYNC_EMPLOYEE]);;
};

var getOrganizationPaging = function(res) {

    var options = {
        uri: Setting.VT_GET_ORGANIZATION + '?syncTime=0&parent_id='+ Setting.VT_ORG_ID + '&page=' +res.page + '&per_page=' + res.perPage,
        headers: {
            'User-Agent': 'Request-Promise',
            'Authorization' : 'bearer ' + res.token
        },
        method : 'GET',
        json: true // Automatically parses the JSON string in the response
    };

    request(options,function (error, response) {
        if (response.body.metadata != undefined && response.body.metadata != null){
            totalPages = response.body.metadata.totalPages;
            processOrganization(response.body);
            if (totalPages > res.page){
                var newRequest = res;
                newRequest.page = res.page + 1;
                requetToken(getOrganizationPaging,newRequest);
            };
        };
    });
};

var processOrganization = function(res){
    if (res.content != undefined){
        if (res.content.length > 0){

            var update = [];
            for (let i = 0; i < res.content.length; i++) {
                Organization.findOne({organizationId : res.content[i].organizationId}, function(error, result) {
                    if (error) return;
                    // if not exist then add & create account
                    if (result == null) {
                        var item = res.content[i];
                        item.vtpLastupdate = new Date();
                        item.oldName = item.name;

                        if (item.name != null){
                            item.vtpLastUpdate = new Date();

                            Organization.create(item, function (err, org) {
                                console.log('created', org);
                            });
                        }
                    }
                    else {
                        var item = res.content[i];
                        item.vtpLastupdate = new Date();
                        item.oldName = result.name;

                        Organization.update({organizationId : item.organizationId}, item, function (err, org) {
                            console.log('updated', org);
                        });
                    };
                });
            };
        };
    };
};

var syncOrganization = function () {
    //get last run time
    var lastRuntime = new Date();
    lastRuntime.setDate(lastRuntime.getDate() - 36500);
    var find = false;

    ScheduleJob.find({}, function (err, scheduleJob) {
        if (err) return;

        if (scheduleJob !=null && scheduleJob.length > 0) {
            lastRuntime = scheduleJob[0].lastRuntime;
            find = true;
        }
        if (!find){
            //if first run then insert to db
            ScheduleJob.create({
                jobType : Setting.VT_SYNC_ORG,
                lastRuntime : new Date()
            });
        }
        else {
            //update
            scheduleJob[0].lastRuntime = new Date();

            ScheduleJob.update({_id : scheduleJob[0]._id}, scheduleJob[0],function(err,updated){
            });
        }

        var requestOrganization = new Object();
        requestOrganization.page = 1;
        requestOrganization.perPage = 5;

        requetToken(getOrganizationPaging, requestOrganization);


    }).where('jobType').in([Setting.VT_SYNC_ORG]);;
};

var syncForumGroup = function (req) {
    Organization.find({orgParentId : req.orgParentId}, function(error, result) {
        if (error) return;
        // if not exist then add & create account
        if (result != null) {
            for (let i = 0; i < result.length; i++) {
                //check group exists?
                //if not exists then create new group
                var rs = result[i].organizationId + '-';

                if (result[i].oldName != null) {
                    rs += result[i].oldName.toLowerCase().replace(/  +/g, ' ').replace(/ /gi,'-').replace(/-+/gi,'-');
                }

                rs = encodeURI(rs);
                requestPromise({
                    url: Setting.FORUM_GET_GROUP + rs,
                    method: "GET",
                    headers: {
                        'User-Agent': 'Request-Promise',
                        'Authorization' : Setting.FORUM_TOKEN
                    },
                    json: true,   // <--Very important!!!
                    body : {
                        _uid : 1
                    }
                }).then(function (repos) {
                    if (repos != undefined && repos != null){
                        // exists group
                        if (result[i].forumCategoryCode == undefined || result[i].forumCategoryCode == 0 || result[i].forumCategoryCode == null ){
                            if (result[i].orgParentId != null &&  result[i].orgParentId != 0){
                                Organization.findOne({organizationId : result[i].orgParentId}, function(err, rs){
                                    if (rs != null){
                                        createCategory(result[i], rs.forumCategoryCode);
                                    }
                                    else {
                                        createCategory(result[i], 0);
                                    }
                                });
                            }
                            else {
                                createCategory(result[i], 0);
                            }
                        }
                        else {
                            var reqS = new Object();
                            reqS.orgParentId = req.organizationId;
                            syncForumGroup(reqS);
                        }

                    };
                }).catch(function (err) {
                    if (err.statusCode == 404){
                        //create new group
                        createGroup(result[i]);
                    };
                });
            };
        };
    });
};

var deletePrivileges = function (req) {
    requestPromise({
        url: 'http://125.212.238.119:4567/api/v2/categories/712/privileges',
        method: "GET",
        headers: {
            'User-Agent': 'Request-Promise',
            'Authorization' : Setting.FORUM_TOKEN
        },
        json: true,   // <--Very important!!!
        body : {
            _uid : 1,
        }
    }).then(function (repos) {
        console.log(repos);
    }).catch(function (err) {
        console.log(err);
    });
    /*requestPromise({
        url: Setting.FORUM_CREATE_CATEGORY + req.forumCategoryCode + '/privileges',
        method: "DELETE",
        headers: {
            'User-Agent': 'Request-Promise',
            'Authorization' : Setting.FORUM_TOKEN
        },
        json: true,   // <--Very important!!!
        body : {
            _uid : 1,
            privileges  : ['read','write'],
            groups: ['registered-users', 'guests', 'spiders']
        }
    }).then(function (repos) {
        createPrivileges(req);
    }).catch(function (err) {
        console.log(err);
    });*/
};

var createPrivileges = function (req) {
    var rs = req.organizationId + '-';

    if (rs.name != null) {
        rs += req.name.toLowerCase().replace(/  +/g, ' ').replace(/ /gi,'-').replace(/-+/gi,'-');
    }

    requestPromise({
        url: Setting.FORUM_CREATE_CATEGORY + req.forumCategoryCode + '/privileges',
        method: "PUT",
        headers: {
            'User-Agent': 'Request-Promise',
            'Authorization' : Setting.FORUM_TOKEN
        },
        json: true,   // <--Very important!!!
        body : {
            _uid : 1,
            privileges  : ['read','write'],
            groups: [rs]
        }
    }).then(function (repos) {
        console.log(repos);
    }).catch(function (err) {
        console.log(err);
    });
};

var createCategory = function (req, forumParentCategoryCode, callback) {
    if (req.forumCategoryCode != undefined && req.forumCategoryCode != 0) {
        return;
    };

    requestPromise({
        url: Setting.FORUM_CREATE_CATEGORY,
        method: "POST",
        headers: {
            'User-Agent': 'Request-Promise',
            'Authorization' : Setting.FORUM_TOKEN
        },
        json: true,   // <--Very important!!!
        body : {
            _uid : 1,
            name: req.name,
            parentCid : forumParentCategoryCode
        }
    }).then(function (repos) {
        //update forumCategoryCode, forumParentCategoryCode
        if (repos.code = 'ok') {
            req.forumCategoryCode = repos.payload.cid;
            req.forumParentCategoryCode = forumParentCategoryCode;
            Organization.update( {organizationId : req.organizationId}, req, function (err, org) {
                var res = new Object();
                res.orgParentId = req.organizationId;
                syncForumGroup(res);
            });
        }
    }).catch(function (err) {
        console.log(err);
    });
};

var createGroup = function (req) {
    var groupName = req.organizationId + '-' + req.name;
    requestPromise({
        url: Setting.FORUM_CREATE_GROUP,
        method: "POST",
        headers: {
            'User-Agent': 'Request-Promise',
            'Authorization' : Setting.FORUM_TOKEN
        },
        json: true,   // <--Very important!!!
        body : {
            _uid : 1,
            name: groupName
        }
    }).then(function (repos) {
        //create category
        if (repos.code == 'ok') {
            if (req.orgParentId != null && req.orgParentId != 0) {
                Organization.findOne({organizationId: req.orgParentId}, function (error, result) {
                    if (result != null && result.forumCategoryCode != undefined && result.forumCategoryCode != null && result.forumCategoryCode != 0) {
                        createCategory(req, result.forumCategoryCode);
                    }
                    else {
                        createCategory(req, 0);
                    }
                });
            }
            else {
                createCategory(req, 0);
            }
        }
    }).catch(function (err) {
        console.log(err);
    });
};

var syncPrivileges = function () {
    Organization.find({}, function(error, result) {
        if (result != null && result.length > 0) {
            for (let i = 0; i < result.length; i++) {
                if (result[i].forumCategoryCode != undefined && result[i].forumCategoryCode != null && result[i].forumCategoryCode != 0) {
                    deletePrivileges(result[i])
                }
            };
        };
    });
};

var VTP4rumSync = {
    requetToken : requetToken,
    getEmployeePaging : getEmployeePaging,
    processEmployee : processEmployee,
    syncEmployee :syncEmployee,
    syncOrganization: syncOrganization,
    processOrganization : processOrganization,
    getOrganizationPaging : getOrganizationPaging,
    syncForumGroup : syncForumGroup,
    syncPrivileges : syncPrivileges,
};

module.exports = VTP4rumSync;
