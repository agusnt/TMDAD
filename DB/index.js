const amqp = require('amqp');
const mongoose = require('mongoose');


// Import db and passport
const config = require('./config.js');

require('./db.js');
require('events').EventEmitter.defaultMaxListeners = Infinity;

//==============================================================================
// Connect to DB
//==============================================================================
mongoose.connect(config.db, function(err, res) {
  if(err) throw err;
  console.log('[DB] Connected to mongo');
});
var Tweet = mongoose.model('Tweet');



// Broker address
var brokerURL = process.env.CLOUDAMQP_URL ? process.env.CLOUDAMQP_URL : "amqp://localhost";
var brokerURL = config.amqp;

//==============================================================================
// AMQP Connection
//==============================================================================

var connection = amqp.createConnection(
    { url: brokerURL + "?heartbeat=60" },
    { reconnect: { strategy: 'linear', reconnectBackoffTime: 10000 } }
);

var queue_ = null;
// Connect to AMQP
connection.on('ready', function () {
    console.log('[DB] Ready')
    connection.exchange('db', { type: 'fanout' }, function(exchange) {
        console.log("[DB] Ready")

        connection.queue('my_queueDBTweet', function(queue){
            console.log('[DB] Created queue')
            queue.bind(exchange, 'db');

            queue.subscribe(function (message) {
                var encoded_payload = unescape(message.data)
                var data = JSON.parse(encoded_payload)
                if (data.action !== undefined)
                {
                    query = {search: data.search}
                    Tweet.find(query, function(err, d){
                        d_payload = JSON.stringify(d); 
                        console.log(d)
                        exchange.publish('dash', d_payload, {});
                    })
                    return;
                }
                var query = {'id': data.id};
                Tweet.findOne(query, function(err, t)
                {
                    if (t === null){
                        if (data.numLinks !== undefined)
                        {
                            var tweet = new Tweet({
                                id: data.id,
                                text: data.text,
                                search: data.search,
                                created_at: data.created_at,
                                numWords: data.numWords,
                                numHashtag: data.numHashtag,
                                numMentions: data.numMentions,
                                numLinks: data.numLinks,
                                relatedWords: null
                            });
                            tweet.save(function(err){});
                        } else if (data.textTr !== undefined)
                        {
                            var tweet = new Tweet({
                                id: data.id,
                                text: data.text,
                                textTr: data.textTr,
                                search: data.search,
                                created_at: data.created_at
                            });
                            tweet.save(function(err){});
                        }
                        else {
                            var tweet = new Tweet({
                                id: data.id,
                                text: data.text,
                                search: data.search,
                                created_at: data.created_at,
                                relatedWords: data.related
                            });

                            tweet.save(function(err){});
                        }
                    }
                    else{
                        if (data.numLinks !== undefined)
                        {
                            aux = {
                                numWords: data.numWords,
                                numHashtag: data.numHashtag,
                                numMentions: data.numMentions,
                                numLinks: data.numLinks
                            }
                            Tweet.update(query, aux, {multi: true}, function(err, n){});
                        } else if (data.textTr !== undefined)
                        {
                             aux = {
                                textTr: data.textTr
                            }
                            Tweet.update(query, aux, {multi: true}, function(err, n){});                           
                        } 
                        else
                        {
                            aux = {
                                relatedWords: data.related
                            }
                            Tweet.update(query, aux, {multi: true}, function(err, n){});
                        }
                    }
                });
            });
        });
    });
});