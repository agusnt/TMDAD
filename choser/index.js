const amqp = require('amqp');
const Twitter = require('node-tweet-stream');
const config = require('./config.js');

// Global variables
var t = new Twitter(
{
    consumer_key: config.twitter.key,
    consumer_secret: config.twitter.key_secret,
    token: config.twitter.token,
    token_secret: config.twitter.token_secret
});
var searchParameter = []

// Broker address
//var brokerURL = process.env.CLOUDAMQP_URL ? process.env.CLOUDAMQP_URL : "amqp://localhost";
var brokerURL = config.amqp
var exTw = null;

/**
 * Initialize connection with AMQP
 */
var connection = amqp.createConnection(
    { url: brokerURL + "?heartbeat=60", debug: true },
    { reconnect: { strategy: 'constant', initial: 1000 } }
);

// Connect to AMQP
connection.on('ready', function () {
    connection.exchange('tweet', {type: 'fanout'}, function(ex)
    {
        exTw = ex;
    });
    connection.exchange('chooser', { type: 'fanout' }, function(exchange) {
        //console.log("[AMQP] Ready")

        connection.queue('chooser_queue', function(queue){
            //console.log('[AMQP] Created chooser_queue')
            queue.bind(exchange, 'chooser');

            queue.subscribe(function (message) {
                var encoded_payload = unescape(message.data)
                var data = JSON.parse(encoded_payload)
                
                if (data.action === 'off') connection.disconnect();
                else if (data.action === 'on')
                {
                    connection = amqp.createConnection(
                        { url: brokerURL + "?heartbeat=60", debug: true },
                        { reconnect: { strategy: 'constant', initial: 1000 } }
                    );
                } else if (data.action === 'broker')
                {
                    brokerURL = data.broker;
                    connection = amqp.createConnection(
                        { url: brokerURL + "?heartbeat=60", debug: true },
                        { reconnect: { strategy: 'constant', initial: 1000 } }
                    );
                }
                else if (data.action === 'sub'){searchParameter.push(data.search); t.track(data.search); }
                else if (data.action === 'usub') 
                {
                    var index = searchParameter.indexOf(data.search);
                    if (index > 0) searchParameter.splice(index, 1); 
                    else t.untrack(data.search)
                }
            });
        });
    });
});
// Tweet configuration
t.on('tweet', function (tweet) {
    searchParameter.forEach(function(item)
    {
        if (tweet.text.indexOf(item) > 0)
        {
            tweet.search = item;
            var encoded_payload = JSON.stringify(tweet);
            exTw.publish('tweet', encoded_payload, {});
        }
    });
});
 
t.on('error', function (err) {
    console.error('Oh no')
});