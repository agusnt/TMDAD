const spdy = require('spdy');
const express = require('express');
const path = require('path');
const fs = require('fs');
const request = require('request');
const amqp = require('amqp');
const config = require('./config');

//==============================================================================
// AMQP Connection
//==============================================================================
var brokerURL = config.amqp;
var queue = null;
var connection = amqp.createConnection(
    { url: brokerURL + "?heartbeat=60", debug: true },
    { reconnect: { strategy: 'constant', initial: 1000 } }
);

var exchange = null;
connection.on('ready', function()
{
    connection.exchange('tweet', { type: 'fanout' }, function(ex)
    {
       exchange = ex; 
    });
});

//Allow self signed certificate
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

//==============================================================================
// HTTP2 Server
//==============================================================================
const app = express();

// Server options
const options = {
    key: fs.readFileSync(__dirname + '/certificate/server.key'),
    cert:  fs.readFileSync(__dirname + '/certificate/server.crt')
}

// Server routes
app.get('/', (req, res) => {
    console.log("[HTTP2] new request to /");
    res.sendFile(__dirname + '/static/index.html');
});

//==============================================================================
// HTTP2 SSE
//==============================================================================
var id_ = 0;
global.openConnections = {};
global.tweetInfo = {};
app.get('/stats', function(req, res)
{
    if (req.query.search === undefined) return res.set("Connection", "close");
    console.log("[HTTP2] somebody is searching...");

    // Test if this client already have a search term a remove it
    //removeSearch(req);

    // HTTP2 request to chooser
    var optionsChoser =
    {
        url: config.choser.sub,
        method: 'POST',
        headers: {
            'Content-Type': 'application/javascript'
        },
        form: {'tweet': req.query.search}
    };
    request(optionsChoser, (error, res_, body) =>
    {
        if (error !== null) return res.set("Connection", "close");
        if (res_.statusCode !== 200) return res.set("Connection", "close");

        // Set hight timeout
        req.socket.setTimeout(36000000);

        // Headers for SSE
        res.writeHead(200, 
        {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });
        res.write('\n');

        // Save connection
        if (openConnections[req.query.search] === undefined) 
        {
            openConnections[req.query.search] = [res];
            // Create a new queue for the element
            connection.queue("my_queue", function(queue)
            {
                queue.bind(exchange, req.query.search);
                queue.subscribe(function (msg)
                {
                    var encoded_payload = unescape(msg.data);
                    var data = JSON.parse(encoded_payload);
                    openConnections[data.search].forEach(function(item)
                    {
                        if (tweetInfo[data.search] === undefined) 
                            tweetInfo[data.search] = {}
                        // Stadistics information
                        if (tweetInfo[data.search].numWords === undefined)
                            tweetInfo[data.search].numWords = 0;
                        else if (data.numWords !== undefined)
                            tweetInfo[data.search].numWords = (tweetInfo[data.search].numWords + data.numWords) / 2;
                        if (tweetInfo[data.search].numHashtag === undefined)
                            tweetInfo[data.search].numHashtag = 0;
                        else if (data.numHashtag !== undefined)
                            tweetInfo[data.search].numHashtag = (tweetInfo[data.search].numHashtag + data.numHashtag) / 2;
                        if (tweetInfo[data.search].numMentions === undefined)
                            tweetInfo[data.search].numMentions = 0;
                        else if (data.numMentions !== undefined)
                            tweetInfo[data.search].numMentions = (tweetInfo[data.search].numMentions + data.numMentions) / 2;
                        if (tweetInfo[data.search].numLinks === undefined)
                            tweetInfo[data.search].numLinks = 0;
                        else if (data.numLinks !== undefined)
                            tweetInfo[data.search].numLinks = (tweetInfo[data.search].numLinks + data.numLinks) / 2;
                        // Related Words
                        if (tweetInfo[data.search].words === undefined)
                            tweetInfo[data.search].words = {};
                        for (var key in data.related)
                        {
                            if (tweetInfo[data.search].words[key] === undefined)
                                tweetInfo[data.search].words[key] = 0;
                            else tweetInfo[data.search].words[key] = tweetInfo[data.search].words[key] + 1
                        }
                        console.log(tweetInfo);
                        item.write('id: ' + (new Date()).toLocaleTimeString() + '\n');
                        item.write('data: ' + JSON.stringify(tweetInfo[data.search]) + '\n\n');
                    });
                });
            });
        }
        else openConnections[req.query.search].push(res);

        // Is a request closed?, we remove it from our world
        req.on('close', function()
        {
            console.log("[SSE] Client doesn't love me :'(")
            removeSearch(res);
        });
    });
});

//==============================================================================
// Let's go HTTP2 Server
//==============================================================================
spdy.createServer(options, app).listen(port, (error) => {
    if (error)
    {
        console.error(error)
        return process.exit(1)
    } else 
    {
        console.log('Listening on port: ' + port + '.')
    }
});


// Remove if it is possible a term which is subscribed to Twitter
function removeSearch(res)
{
    for (var i in openConnections)
    {
        var index = openConnections[i].indexOf(res);
        if (index > -1) openConnections[i].splice(index, 1);
        // Unsubscribe chooser
        if (index > -1 && openConnections[i].length === 0)
        {
            console.log("[SSE] Unsuscribing")
            var optionsDel =
            {
                url: config.choser.usub,
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/javascript'
                },
                form: {'tweet': i}
            };
            request(optionsDel, (_error, _res, _body) => {});
            break;
        }
    }
}
