const amqp = require('amqp');
const stopWord = require('stopword');

// Import db and passport
const config = require('./config.js');

// Broker address
var brokerURL = process.env.CLOUDAMQP_URL ? process.env.CLOUDAMQP_URL : "amqp://localhost";
var brokerURL = config.amqp;

//==============================================================================
// AMQP Connection
//==============================================================================

var connection = amqp.createConnection(
    { url: brokerURL + "?heartbeat=60", debug: true },
    { reconnect: { strategy: 'constant', initial: 1000 } }
);

var configDB = null;
var configTP = null;

// Connect to AMQP
connection.on('ready', function () {
    connection.exchange('db', { type: 'fanout' }, function(ex)
    {
        //console.log("[AMQP Dashboard] DB")
        configDB = ex; 
    });
    connection.exchange('tp', { type: 'fanout' }, function(ex)
    {
        //console.log("[AMQP Dashboard] DB")
        configTP = ex; 
    });
    connection.exchange('tweet', { type: 'fanout' }, function(exTw) {
        //console.log("[AMQP] Ready")

        connection.queue('my_queueStatics', function(queue){
            //console.log('[AMQP] Created queue')
            queue.bind(exTw, 'tweet');

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
                // Counting associate information
                //******************************************************************
                output['numWords'] = words.length;
                output['numHashtag'] = 0;
                output['numMentions'] = 0;
                output['numLinks'] = 0;

                // Regex expression to count things
                var HPattern = new RegExp(/#(.)*/); //Hastags
                var MPattern = new RegExp(/@(.)*/); //Mentions
                var LPattern = new RegExp(/(https?:\/\/[^\s]+)/); //Links
                var NPattern = new RegExp(/[0-9]$/); //Numbers

                var index = {};
                // Count number of words
                wordsNoStop.forEach(function (word)
                {
                    if (word.match(MPattern) !== null) output['numMentions'] += 1; 
                    if (word.match(LPattern) !== null) output['numLinks'] += 1; 
                    if (word.match(HPattern) !== null) output['numHashtag'] += 1;
                });
                output.search = data.search;
                output.text = data.text;
                output.id = data.id_str;

                //console.log("[Statistics] Published Tweet");                        
                encoded_payload = JSON.stringify(output);                     
                configTP.publish('', encoded_payload, {});

                var dboutput = {}
                dboutput.numWords = output['numWords'];
                dboutput.numHashtag = output['numHashtag'];
                dboutput.numMentions = output['numMentions'];
                dboutput.numLinks = output['numLinks'];
                dboutput.id = data.id_str;
                dboutput.text = data.text;
                dboutput.created_at = data.created_at;
                dboutput.search = data.search;
                dboutput_payload = JSON.stringify(dboutput); 
                configDB.publish('db', dboutput_payload, {});                        
            });
        });
    });
    connection.exchange('statistics', { type: 'fanout' }, function(exchange) {
        //console.log("[AMQP Statistics] Ready")

        connection.queue('my_queue2', function(queue){
            //console.log('[AMQP Statistics] Created queue2')
            queue.bind(exchange, 'relatedWords');

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

