var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var TweetSchema = new Schema({
    text: String,
    textTr: String,
    id: String,
    search: String,
    created_at: String,
    numWords: Number,
    numHashtag: Number,
    numMentions: Number,
    numLinks: Number,
    relatedWords: {}
});

var TweetSchema = mongoose.model('Tweet', TweetSchema);