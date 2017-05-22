var amqp = require('amqplib/callback_api');

// Vars
// For publisher
var pubChannel = null;
var offlinePubQueue = [];

// if the connection is closed or fails to be established at all, we will reconnect
var amqpConn = null;

module.exports = {
    startAMQ: function(url, func)
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
                //return setTimeout(startAMQ(url, () => {}), 1000);
            });

            console.log("[AMQP] connected");
            amqpConn = conn;

            func();
        });
    },

    //Start a Publisher
    startPublisher: function() 
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
    },
    // method to publish a message, will queue messages internally if the connection is down and resend later
    publish: function(exchange, routingKey, content) 
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
    },
    // A worker that acks messages only if processed succesfully
    startWorker: function(queue) 
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
                console.log("[AMQP Worker] Worker is started");
            });

            function processMsg(msg)
            {
                // Parse msg content
                var data = JSON.parse(msg.content.toString());
                global.openConnections[queue].forEach(function(item)
                {
                    // Test if some field is empty
                    if (global.tweetInfo[queue] === undefined) 
                        global.tweetInfo[queue] = {}
                    // Number of words
                    if (global.tweetInfo[queue].numWords === undefined)
                        global.tweetInfo[queue].numWords = data.numWords;
                    else global.tweetInfo[queue].numWords = (global.tweetInfo[queue].numWords + data.numWords) / 2;
                    // Number of hasthag
                    if (global.tweetInfo[queue].numHashtag === undefined)
                        global.tweetInfo[queue].numHashtag = data.numHashtag;
                    else global.tweetInfo[queue].numHashtag = (global.tweetInfo[queue].numHashtag + data.numHashtag) / 2;
                    // Language
                    if (global.tweetInfo[queue].lang === undefined)
                        global.tweetInfo[queue].lang = {};
                    if (global.tweetInfo[queue].lang[data.lang] === undefined)
                        global.tweetInfo[queue].lang[data.lang] = 1;
                    else global.tweetInfo[queue].lang[data.lang] = global.tweetInfo[queue].lang[data.lang] + 1;
                    // Related Words
                    if (global.tweetInfo[queue].words === undefined)
                        global.tweetInfo[queue].words = [];
                    for (var key in data.related)
                    {
                        if (global.tweetInfo[queue].words[key] === undefined)
                            global.tweetInfo[queue].words[key] = 0;
                        else global.tweetInfo[queue].words[key] = global.tweetInfo[queue].words[key] + 1
                    }

                    item.write('id: ' + (new Date()).toLocaleTimeString() + '\n');
                    item.write('data:' + JSON.stringify(global.tweetInfo[queue]) + '\n\n');
                });
                ch.ack(msg);
            }
        });
    }
}

function closeOnErr(err) 
{
    if (!err) return false;
    console.error("[AMQP] error", err);
    amqpConn.close();
    return true;
}
