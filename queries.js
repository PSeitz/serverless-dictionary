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

function getQuery(searchterm, lang, levenshtein_distance){
    levenshtein_distance = levenshtein_distance || 0
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
        let orquery = [ ]
        let addDe = (lang === 'de' || !lang)
        if (addDe)
            orquery.push({search: qpPart(searchterm, 'meanings.ger[].text', levenshtein_distance), boost: [{ path:'meanings.ger[].rank', fun:rank=>10/rank }, { path:'commonness', fun:Math.log, param: 1}]})

        if (lang === 'en'|| !lang)
            orquery.push({search: qpPart(searchterm, 'meanings.eng[]', levenshtein_distance), boost: { path:'commonness', fun:Math.log, param: 1}})

        if (addDe && hasUmlautLikeCharacter(searchterm.toLowerCase())){
            let converted = convertUmlautLikeCharacter(searchterm.toLowerCase())
            orquery.push({search: qpPart(converted, 'meanings.ger[]', levenshtein_distance),
                boost: { path:'commonness', fun:Math.log, param: 1}})
        }
        return {OR:orquery}
    }
}

// findEntrys(process.argv[2], undefined, 0, true).then(res => {
//     console.log(JSON.stringify(res[4], null, 2))
// })

// findEntrys('あたま', undefined, 0, true).then(res => {
//     console.log(JSON.stringify(res[0], null, 2))
// })

findEntrys('kopf', 'de', 0, true).then(res => {
    console.log(JSON.stringify(res[1], null, 2))
})

// findEntrys('weich', 'de', 0, true).then(res => {
//     console.log(JSON.stringify(res[0], null, 2))
// })


// findEntrys('fenster', 'de', 0, true).then(res => {
//     // console.log(JSON.stringify(res[0], null, 2))
// })

// findEntrys('とある', 'de', 0, true).then(res => {
//     console.log(JSON.stringify(res[0], null, 2))
//     console.log(JSON.stringify(res[1], null, 2))
// })


function findEntrys(searchterm, lang, levenshtein_distance, printTime) {
    searchterm  = searchterm.trim()
    let startTime = process.hrtime()

    let searchDb = require('serverless-search').searchdb()
    let query = getQuery(searchterm, lang, levenshtein_distance)

    return searchDb.searchDb('jmdict', query).then(function(res){
        if (printTime)console.log('Query: ' +  process.hrtime(startTime)[1]/1000000 + ' ms.')
        return res
    })
}

function getSuggestions(query) {
}



module.exports.search = (event, context, callback) => {

// exports.handler = (event, context, callback) => {
    console.log("jaaa suche kommt an!")
    let request = event.queryStringParameters
    console.log(request)
    // TODO implement
    findEntrys(request.searchterm, undefined, 0, request.printTime).then(entries => {
        let response = {
            "statusCode": 200,
            "headers": { 
                "Content-Type": "application/json; charset=utf-8",
                "Access-Control-Allow-Origin" : '*'  
            },
            "body": JSON.stringify(entries)
        }
        console.log(response)
        callback(null, response)
    })
}


module.exports.alexa = (event, context, callback) => {
    const tehwort = event.request.intent.slots.tehwort.value

    findEntrys(tehwort, 'de', 0,  true).then(entries => {
        if (entries.length === 0) {
            const response = {
                version: '1.0',
                response: {
                    outputSpeech: {
                        type: 'PlainText',
                        text: `zoory echt, ich hab nichts gefunden für ${tehwort}`
                    },
                },
            }
            callback(null, response)
        }else {
            let japanisch = entries[0].kana[0].romaji
            japanisch = japanisch.toLowerCase()
            japanisch = japanisch.replace('ie', 'iä')
            japanisch = japanisch.replace('ji', 'dschy')
            console.log(entries[0])
            const response = {
                version: '1.0',
                response: {
                    outputSpeech: {
                        type: 'PlainText',
                        text: `${tehwort} auf japanisch ist: ${japanisch}`
                    },
                },
            }
            console.log(response)
            callback(null, response)
        }
        
        
    })
}


// let event = {request:{intent:{slots:{tehwort:{value:"angeben"}}}}}
// module.exports.alexa( event, {}, () => {})


// {
//   "searchterm": "having a long torso",
//   "fuzzy": true,
//   "showGerman": true,
//   "showEnglish": true,
//   "printTime": true
// }


//  searchterm=having a long torso&fuzzy=true&showGerman=true&showEnglish=true&printTime=true
