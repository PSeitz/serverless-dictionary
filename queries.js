'use strict'
process.env['PATH'] = process.env['PATH'] + ':' + process.env['LAMBDA_TASK_ROOT']
// const taim = require('taim')

function isJapanese(string){
    return string.match(/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/)
}

function containsKanji(string){
    return string.match(/[\u4e00-\u9faf\u3400-\u4dbf]/)
}

function containsKana(string){
    return string.match(/[\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f]/)
}

function removeParentheses(orig){
    return orig.replace(/ *\([^)]*\) */g, "")
}

function hasUmlautLikeCharacter(orig){
    if (orig.includes('ae') || orig.includes('ue') || orig.includes('oe') || orig.includes('ss') ) return true
    return false
}

function convertUmlautLikeCharacter(orig){
    let replace = orig.replace('ae', 'ä')
    replace = replace.replace('ue', 'ü')
    replace = replace.replace('oe', 'ö')
    replace = replace.replace('ss', 'ß')
    return replace
}

let usingKana = 'word usually written using kana alone'

function qpPart(searchterm, path, levenshtein_distance){
    levenshtein_distance = levenshtein_distance || 0
    return {
        term: searchterm,
        path:path,
        levenshtein_distance:levenshtein_distance,
        firstCharExactMatch:true,
        startsWith:true,
        operator:'some'
    }
}

function getQuery(searchterm){
    if (containsKanji(searchterm)){
        return {
            search: qpPart(searchterm, 'kanji[].text'),
            boost: { path:'kanji[].commonness', fun:Math.log, param: 1}
        }
    }else if(containsKana(searchterm)){
        return {
            search: qpPart(searchterm, 'kana[].text', 1),
            boost: { path:'kana[].commonness', fun:Math.log, param: 1 }
        }
    }else {
        let orquery = [{search: qpPart(searchterm, 'meanings.eng[]', 1)},
                       {search: qpPart(searchterm, 'meanings.ger[]', 1)}]

        if (hasUmlautLikeCharacter(searchterm.toLowerCase())){
            let converted = convertUmlautLikeCharacter(searchterm.toLowerCase())
            orquery.push({search: qpPart(converted, 'meanings.ger[]', 1)})
        }
        return { OR:orquery}
    }
}

// findEntrys('majestät', true)

// findEntrys('having a long torso', true).then(res => {
//     console.log(JSON.stringify(res, null, 2))
// })


function findEntrys(searchterm, printTime) {
    searchterm  = searchterm.trim()

    let startTime = process.hrtime()

    let searchDb = require('serverless-search').searchdb()
    let query = getQuery(searchterm)

    return searchDb.searchDb('jmdict', query).then(function(res){
        if (printTime)console.log('Query: ' +  process.hrtime(startTime)[1]/1000000 + ' ms.')
        return res
    })
}

function getSuggestions(query) {
}


// function startSearch(){
//     findEntrys('Geisterhaus')
//     findEntrys('book').then(function(entries){
//         console.log(JSON.stringify(entries, null, 2))
//     })
//     findEntrys('どうながたんそく')
// }
// startSearch()

module.exports.search = (event, context, callback) => {

// exports.handler = (event, context, callback) => {
    console.log("jaaa suche kommt an!")
    let request = event.queryStringParameters
    console.log(request)
    // TODO implement
    findEntrys(request.searchterm, request.printTime).then(entries => {

        let response = {
            "statusCode": 200,
            "headers": { "Content-Type": "application/json; charset=utf-8" },
            "body": JSON.stringify(entries)
        }
        console.log(response)
        callback(null, response)
    })
}


// {
//   "searchterm": "having a long torso",
//   "fuzzy": true,
//   "showGerman": true,
//   "showEnglish": true,
//   "printTime": true
// }


//  searchterm=having a long torso&fuzzy=true&showGerman=true&showEnglish=true&printTime=true
