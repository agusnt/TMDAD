const LanguageDetect = require('languagedetect');
const stopWord = require('stopword');
const config = require('./config');
var lngDetector = new LanguageDetect();
 
// Broker address
var brokerURL = process.env.CLOUDAMQP_URL ? process.env.CLOUDAMQP_URL : "amqp://localhost";
var brokerURL = config.amqp;

var amqp = require('amqplib/callback_api');

// Vars
// For publisher
var pubChannel = null;
var offlinePubQueue = [];
id_ = 0;

// if the connection is closed or fails to be established at all, we will reconnect
var amqpConn = null;

function startAMQP(url, func)
{
    amqp.connect(url + "?heartbeat=60", function(err, conn)
    {
        if (err)
        {
            console.error("[AMQP]", err.message);
            return setTimeout(startAMQP, 1000);
        }
        conn.on("error", function(err) 
        {
            if (err.message !== "Connection closing") 
            {
                console.error("[AMQP] conn error", err.message);
            }
        });
        conn.on("close", function() 
        {
            console.error("[AMQP] reconnecting");
            return setTimeout(startAMQP, 1000);
        });

        console.log("[AMQP] connected");
        amqpConn = conn;

        func();
    });
}

// A worker that acks messages only if processed succesfully
function startWorker(queue) 
{
    amqpConn.createChannel(function(err, ch)
    {
        if (closeOnErr(err)) return;
        ch.on("error", function(err)
        {
            console.error("[AMQP] channel error", err.message);
        });
        ch.on("close", function()
        {
            console.log("[AMQP] channel closed");
        });
        ch.prefetch(10);
        ch.assertQueue(queue, { durable: true }, function(err, _ok)
        {
            if (closeOnErr(err)) return;
            ch.consume(queue, processMsg, { noAck: false });
        });
        console.log("[AMQP] Starting Worker")
        function processMsg(msg) {
            var data = JSON.parse(msg.content.toString());
            // We receive the message
            ch.ack(msg);
            var output = {}

            // Split tweet in words
            var words = data.text.replace(/[.,?!;()"'-]/g, " ")
                .replace(/\s+/g, " ")
                .toLowerCase()
                .split(" ");
            //Remove stop words
            var wordsNoStop = stopWord.removeStopwords(words, stopWord[data.lang])

            //==================================================================
            // Tweet Processors
            //==================================================================

            //******************************************************************
            // Counting associate information
            //******************************************************************
            output['numWords'] = words.length;
            output['numHashtag'] = 0;

            // Regex expression to count things
            var HPattern = new RegExp(/#(.)*/); //Hastags
            var MPattern = new RegExp(/@(.)*/); //Mentions
            var LPattern = new RegExp(/(https?:\/\/[^\s]+)/); //Links
            var NPattern = new RegExp(/[0-9]$/); //Numbers

            //******************************************************************
            // Getting information
            //******************************************************************
            output['lang'] = data.lang; // language
            if (data.place !== null) output['place'] = data.place.country; // country

            //******************************************************************
            // Related Words
            //******************************************************************

            var index = {};
            // Count number of words
            wordsNoStop.forEach(function (word)
            {
                if (word.match(HPattern) === null 
                    && word.match(MPattern) === null
                    && word.match(LPattern) === null
                    && word.match(NPattern) === null)
                {
                    if (!(index.hasOwnProperty(word))) index[word] = 0;
                    index[word]++;
                }

                // Number of words
                if (word.match(HPattern) !== null) 
                    output['numHashtag'] = output['numHashtag'] + 1;
            });
            output['related'] = index;
            output.search = data.search;
            publish("", data.search, new Buffer(JSON.stringify(output)));

            //console.log("[PROC] Tweet published")
        }
    });
}

function closeOnErr(err) 
{
    if (!err) return false;
    console.error("[AMQP] error", err);
    amqpConn.close();
    return true;
}

function startPublisher() 
{
    amqpConn.createConfirmChannel(function(err, ch) 
    {
        if (closeOnErr(err)) return;
        ch.on("error", function(err) 
        {
            console.error("[AMQP] channel error", err.message);
        });

        ch.on("close", function() 
        {
            console.log("[AMQP] channel closed");
        });

        pubChannel = ch;
        while (true) 
        {
            var m = offlinePubQueue.shift();
            if (!m) break;
            publish(m[0], m[1], m[2]);
        }
    });
}

// method to publish a message, will queue messages internally if the connection is down and resend later
function publish(exchange, routingKey, content) 
{
    try 
    {
        pubChannel.publish(exchange, routingKey, content, { persistent: true },
            function(err, ok)
            {
                if (err)
                {
                    console.error("[AMQP] publish", err);
                    offlinePubQueue.push([exchange, routingKey, content]);
                    pubChannel.connection.close();
                }
                
            });
    } catch (e)
    {
        console.error("[AMQP] publish", e.message);
        offlinePubQueue.push([exchange, routingKey, content]);
    }
}

/**
 * Initialize connection with AMQP as a worker
 */
startAMQP(brokerURL, function(){
    startWorker("tweet");
    startPublisher();
});

