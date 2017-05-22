const amqp = require('amqp');
const stopWord = require('stopword');

// Import db and passport
const config = require('./config.js');

require('events').EventEmitter.defaultMaxListeners = Infinity;

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
var configDB = null;
var configTP = null;

// Connect to AMQP
connection.on('ready', function () {
    //console.log('Ready')
    connection.exchange('tweet', { type: 'fanout' }, function(exchange) {
        //console.log("[AMQP] Ready")
        connection.exchange('db', { type: 'fanout' }, function(ex)
        {
            configDB = ex; 
        });
        connection.exchange('tp', { type: 'fanout' }, function(ex)
        {
            //console.log("[AMQP Dashboard] DB")
            configTP = ex; 
        });
        connection.queue('my_queueRelated', function(queue){
            queue_ = queue;
            //console.log('[AMQP] Created queue')
            queue.bind(exchange, 'tweet');

            queue.subscribe(function (message) {
                //console.log('[AMQP] Msg Recieve')
                var encoded_payload = unescape(message.data)
                var data = JSON.parse(encoded_payload)
                var output = {};

                // Split tweet in words
                var words = data.text.replace(/[.,?!;()"'-]/g, " ")
                    .replace(/\s+/g, " ")
                    .toLowerCase()
                    .split(" ");
                //Remove stop words
                var wordsNoStop = stopWord.removeStopwords(words, stopWord[data.lang])
      
                //******************************************************************
                // Related Words
                //******************************************************************

                // Regex expression to count things
                var LPattern = new RegExp(/(https?:\/\/[^\s]+)/); //Links
                var NPattern = new RegExp(/[0-9]$/); //Numbers

                var index = {};
                // Count number of words
                wordsNoStop.forEach(function (word)
                {
                    if (word.match(LPattern) === null
                        && word.match(NPattern) === null)
                    {
                        if (!(index.hasOwnProperty(word))) index[word] = 0;
                        index[word]++;
                    }
                });
                output['related'] = index;
                output.search = data.search;
                output.id = data.id_str;

                //Send Related Words
                //console.log("[Related Words] Published Tweet");                        
                encoded_payload = JSON.stringify(output);                     
                configTP.publish(data.search, encoded_payload, {});    

                var dboutput = {}
                dboutput.related = output['related'];
                dboutput.id = data.id_str;
                dboutput.text = data.text;
                dboutput.created_at = data.created_at;
                dboutput.search = data.search;
                dboutput_payload = JSON.stringify(dboutput); 
                configDB.publish('db', dboutput_payload, {});                      
            });
        });
    });

    connection.exchange('relatedWords', { type: 'fanout' }, function(exchange) {
        console.log("[AMQP] Ready RelatedWords")

        connection.queue('ConfigQueue', function(q){
            console.log('[AMQP] Created queue')
            q.bind(exchange, '');

            q.subscribe(function (message) {
                var encoded_payload = unescape(message.data)
                var data = JSON.parse(encoded_payload)
                if (data.action === 'off')
                {
                    connection.disconnect();
                    queue_.destroy();
                }
                else if (data.action === 'on')
                {
                    connection = amqp.createConnection(
                        { url: brokerURL + "?heartbeat=60", debug: true },
                        { reconnect: { strategy: 'constant', initial: 1000 } }
                    );
                }else if (data.action === 'broker')
                {
                    brokerURL = data.broker;
                    connection = amqp.createConnection(
                        { url: brokerURL + "?heartbeat=60", debug: true },
                        { reconnect: { strategy: 'constant', initial: 1000 } }
                    );
                }
            });
        });
    });
});