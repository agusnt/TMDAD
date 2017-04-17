const spdy = require('spdy');
const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const amqp = require('amqp');

const passport = require('passport');
const mongoose = require('mongoose');

const cookieParser = require('cookie-parser');
const session = require('express-session');

const LanguageDetect = require('languagedetect');
const stopWord = require('stopword');

// Import db and passport
require('./db.js');
require('./passport')(passport);
const config = require('./config.js');
const MongoStore = require('connect-mongo')(session);

var lngDetector = new LanguageDetect();

// Broker address
var brokerURL = process.env.CLOUDAMQP_URL ? process.env.CLOUDAMQP_URL : "amqp://localhost";
var brokerURL = config.amqp;

//==============================================================================
// Connect to DB
//==============================================================================
mongoose.connect(config.db, function(err, res) {
  if(err) throw err;
  console.log('[DB] Connected to mongo');
});


//==============================================================================
// HTTP2 server
//==============================================================================

// Processor on/off
var on = true;

// Server config
const app = express();

// Express configuration
app.use(cookieParser());
app.use(bodyParser());
app.use(session(
{
    secret: 'secretkey',
    maxAge: new Date(Date.now() + 3600000),
    store: new MongoStore({mongooseConnection:mongoose.connection})  
}));

// Passport Configuration
app.use(passport.initialize());
app.use(passport.session());


// Passport routes
app.get('/auth/twitter', passport.authenticate('twitter'));
app.get('/auth/twitter/callback', passport.authenticate('twitter',
{ 
    successRedirect: '/',
    failureRedirect: '/' 
}));

app.use(bodyParser.urlencoded({ extended: false }));

// Server options
const options = {
    key: fs.readFileSync(__dirname + '/certificate/server.key'),
    cert:  fs.readFileSync(__dirname + '/certificate/server.crt')
}

app.get('/', (req, res) => {
    console.log("[HTTP2] new request to /");
    res.sendFile(__dirname + '/static/index.html');
});

// Turn off processor
app.post('/off', (req, res) => 
{
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (on)
    {
        on = !on;
        connection.disconnect();
        console.log("[AMQP] Disconnect")
        return res.sendStatus(200);
    }
    res.sendStatus(409);
});

// Turn on processor
app.post('/on', (req, res) => 
{
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!on)
    {
        on = !on;
        var connection = amqp.createConnection(
            { url: brokerURL + "?heartbeat=60", debug: true },
            { reconnect: { strategy: 'constant', initial: 1000 } }
        );
        console.log("[AMQP] Connect")
        return res.sendStatus(200);
    }
    res.sendStatus(409);
});

// Load SSL and initialize server
spdy.createServer(options, app).listen(config.port, (error) => {
    if (error)
    {
        console.error(error);
        return process.exit(1)
    } else console.log('Listening on port: ' + config.port + '.')
});


//==============================================================================
// AMQP Connection
//==============================================================================

var connection = amqp.createConnection(
    { url: brokerURL + "?heartbeat=60", debug: true },
    { reconnect: { strategy: 'constant', initial: 1000 } }
);

// Connect to AMQP
connection.on('ready', function () {
    connection.exchange('tweet', { type: 'fanout' }, function(exchange) {
        console.log("[AMQP] Ready")

        connection.queue('my_queue', function(queue){
            console.log('[AMQP] Created queue')
            queue.bind(exchange, '');

            queue.subscribe(function (message) {
                console.log('[AMQP] Msg Recieve')
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

                //Send Related Words
                console.log("[Chooser] Published Tweet");                        
                encoded_payload = JSON.stringify(output);                     
                exchange.publish(data.search, encoded_payload, {});                       
            });
        });
    });
});

