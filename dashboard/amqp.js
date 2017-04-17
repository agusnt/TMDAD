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
                console.error("[AMQP Publisher] channel error", err.message);
            });

            ch.on("close", function() 
            {
                console.log("[AMQP Publisher] channel closed");
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
        console.log(queue);
        amqpConn.createChannel(function(err, ch)
        {
            if (closeOnErr(err)) return;
            ch.on("error", function(err)
            {
                console.error("[AMQP Worker] channel error", err.message);
            });
            ch.on("close", function()
            {
                console.log("[AMQP Worker] channel closed");
            });
            ch.prefetch(10);
            ch.assertQueue(queue, { durable: true }, function(err, _ok)
            {
                if (closeOnErr(err)) return;
                ch.consume("jobs", processMsg, { noAck: false });
            });
            console.log("[AMQP Worker] Starting Worker");

            function processMsg(msg)
            {
                console.log(msg.content.toString());
                global.openConnections[queue].forEach(function(item)
                {
                    //if (item !== null)
                    //{
                        item.write('id: ' + (new Date()).toLocaleTimeString() + '\n');
                        item.write('data:' + msg.content.toString() + '\n\n');
                    //}
                    //else console.log(item)
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
