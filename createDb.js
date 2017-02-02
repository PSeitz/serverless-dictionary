'use strict'

let jsonfilter = require('serverless-search').jsonfilter()
let database = require('serverless-search').database()

var schema = {
    'pos': true,
    'commonness': true,
    'misc': true,
    'kanji': [
        {
            'text': true,
            'commonness': true
            // 'num_occurences': true,
            // 'readings': true
        }
    ],
    'kana': [
        {
            'text': true,
            'romaji': true,
            'commonness': true
            // 'num_occurences': true
        }
    ],
    'meanings':
    {
        'eng': true,
        'ger': true
    }
    ,
    'ent_seq': true
}

return database.createDatabaseFromFile('jmdict.json', 'jmdict',  [
    { boost:'commonness' , options:{type:'int'}},
    // { fulltext:'ent_seq' },
    { fulltext:'kanji[].text' }, 
    { fulltext:'kana[].text' }, 
    // { fulltext:'kana[].text' }, 
    // { fulltext:'kanji[].text' }, 
    { fulltext:'meanings.ger[].text', options:{tokenize:true} }, 
    { boost:'meanings.ger[].rank' , options:{type:'int'}}, 
    { fulltext:'meanings.eng[]', options:{tokenize:true} }, 
    { boost:'kanji[].commonness' , options:{type:'int'}}, 
    { boost:'kana[].commonness', options:{type:'int'} }
], schema)
.catch(console.log)