#!/bin/bash


eval "node ./choser/index.js &"
pid1=$!
eval "node ./dashboard/index.js &"
pid2=$!
eval "node ./processor/RelatedWords/index.js &"
pid3=$!
eval "node ./processor/Statistics/index.js &"
pid4=$!
eval "node ./RealTimeApi/index.js &"
pid5=$!
eval "node ./DB/index.js &"
pid6=$!
eval "node ./processor/Language/index.js &"
pid7=$!

read -n1 -r -p "Press any to continue..." key
echo "OK"

kill -9 $pid1
kill -9 $pid2
kill -9 $pid3
kill -9 $pid4
kill -9 $pid5
kill -9 $pid6
kill -9 $pid7

echo "Done"
