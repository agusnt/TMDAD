const spdy = require('spdy');
const express = require('express');
const path = require('path');
const fs = require('fs');
const request = require('request');
const amqp = require('./lib/amqp.js');
const config = require('./config');


//==============================================================================
// AMQP Connection
//==============================================================================
var brokerURL = config.amqp;
amqp.startAMQ(brokerURL, () => {});

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
        url: config.route.sub,
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
            amqp.startWorker(req.query.search);
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
spdy.createServer(options, app).listen(conf.port, (error) => {
    if (error)
    {
        console.error(error)
        return process.exit(1)
    } else 
    {
        console.log('Listening on port: ' + conf.port + '.')
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
