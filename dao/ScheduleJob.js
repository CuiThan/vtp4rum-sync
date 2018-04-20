var mongoose = require('mongoose');
var ScheduleJobSchema = new mongoose.Schema({
    jobType     : String,
    lastRuntime : Date
});
mongoose.model('ScheduleJob', ScheduleJobSchema);

module.exports = mongoose.model('ScheduleJob');