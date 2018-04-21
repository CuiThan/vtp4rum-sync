var app = require('./app');
var port = process.env.PORT || 1234;
var CronJob = require('cron').CronJob;
var VTP4rumSync = require('./controller/VTP4rumSyncController')

var server = app.listen(port, function() {
    console.log('Express server listening on port ' + port);
});
var res = new Object();
res.orgParentId = 196961;
VTP4rumSync.syncForumGroup(res);
//new CronJob('* * * * * *', function() {
//    console.log('Hello puppies!')
//}, null, true, 'America/Los_Angeles');