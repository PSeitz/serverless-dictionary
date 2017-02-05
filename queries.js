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
            orquery.push({search: qpPart(searchterm, 'meanings.ger[].text', levenshtein_distance), boost: [{ path:'meanings.ger[].rank', fun:rank => { if(!rank)return 0; return 10 / rank} }, { path:'commonness', fun:val => Math.log(val+.5)}]})

        if (lang === 'en'|| !lang)
            orquery.push({search: qpPart(searchterm, 'meanings.eng[]', levenshtein_distance), boost: { path:'commonness', fun:Math.log, param: 1}})

        if (addDe && hasUmlautLikeCharacter(searchterm.toLowerCase())){
            let converted = convertUmlautLikeCharacter(searchterm.toLowerCase())
            orquery.push({search: qpPart(converted, 'meanings.ger[].text', levenshtein_distance),
                boost: { path:'commonness', fun:Math.log, param: 1}})
        }
        return {OR:orquery}
    }
}

process.chdir(process.cwd()+'/'+'jmdict')

// findEntrys('あたま', {levenshtein_distance:0, printTime:true}).then(res => {
//     console.log(JSON.stringify(res[0], null, 2))
// })

// findEntrys('glasscheibe', {lang:'de', levenshtein_distance:0, printTime:true}).then(res => {
//     // console.log(JSON.stringify(res[0], null, 2))
//     console.log(require('./jsontoyaml')(res[0]))
// })

// findEntrys(process.argv[2], {lang:'de', levenshtein_distance:0, printTime:true}).then(res => {
//     console.log(JSON.stringify(res[process.argv[3]], null, 2))
// })

// findEntrys('fenster', {lang:'de', levenshtein_distance:0, printTime:true}).then(res => {
//     console.log(JSON.stringify(res[0], null, 2))
// })

// findEntrys('とある', {lang:'de', levenshtein_distance:0, printTime:true}).then(res => {
//     console.log(JSON.stringify(res[0], null, 2))
//     console.log(JSON.stringify(res[1], null, 2))
// })


function findEntrys(searchterm, opt) {
    searchterm  = searchterm.trim()
    let startTime = process.hrtime()

    let searchDb = require('serverless-search').searchdb()
    let query = getQuery(searchterm, opt.lang, opt.levenshtein_distance)
    if(opt.top) query.top = opt.top
    return searchDb.searchDb('jmdict', query).then(function(res){
        if (opt.printTime)console.log('Query: ' +  process.hrtime(startTime)[1]/1000000 + ' ms.')
        return res
    })
}

function getSuggestions(searchterm, lang) {

    let searchindex = require('serverless-search').searchindex()

    // if (!process.cwd().endsWith('jmdict'))
    //     process.chdir(process.cwd()+'/'+'jmdict')
    if (containsKanji(searchterm)){
        return searchindex.suggest({path:'kanji[].text', term:searchterm})
    }else if(containsKana(searchterm)){
        return searchindex.suggest({path:'kana[].text', term:searchterm})
    }else {
        if (lang === 'de')
            return searchindex.suggest({path:'meanings.ger[].text', term:searchterm})

        if (lang === 'en')
            return searchindex.suggest({path:'meanings.eng[]', term:searchterm})
    }
}

function corsReturn(entries, callback){
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
}

// global.suggest = module.exports.suggest = (event, context, callback) => {

// // exports.handler = (event, context, callback) => {
//     let request = event.queryStringParameters
//     console.log(request)
//     getSuggestions(request.searchterm, request.lang || 'de').then(entries => {
//         corsReturn(entries, callback)
//     })
// }

global.search = module.exports.search = (event, context, callback) => {

    let request = event.queryStringParameters
    console.log(request)
    // TODO implement

    let prom = request.searchterm ? findEntrys(request.searchterm, {levenshtein_distance:1, printTime:true}) : getSuggestions(request.suggestterm, 'de')
    prom.then(entries => {
        corsReturn(entries, callback)
    })
    // if (request.searchterm) {
    //     findEntrys(request.searchterm, {levenshtein_distance:1, printTime:true}).then(entries => {
    //         corsReturn(entries, callback)
    //     })
    // }else{
    //     getSuggestions(request.suggestterm, 'de').then(entries => {
    //         corsReturn(entries, callback)
    //     })
    // }

}

// KAUFEN SIE JETZT:  INTERGALAKTISCHE PROTONENGETRIEBENE ELEKTRISCHE WACKELARMWERBEDROIDEN AUF  INTERGALAKTISCHEPROTONENGETRIEBENEELEKTRISCHEWACKELARMWERBEDROIDEN.DE . INTERGALAKTISCHE PROTONENGETRIEBENE ELEKTRISCHE WACKELARMWERBEDROIDEN. DANKE! 

global.alexa = module.exports.alexa = (event, context, callback) => {

    // var Alexa = require('alexa-sdk')
    // var alexa = Alexa.handler(event, context)
    // var handlers = {

    //     'LaunchRequest': function () {
    //         // this.emit(':tell', 'Wörterbuch geladen. Bitte, bitte fragen sie mich was, okeh??')
    //         this.emit(':ask', 'Was soll ich übersetzen?', 'Sage das Wort zum übersetzen')
    //     },

    //     'japanisch': function () {

    //         const tehwort = event.request.intent.slots.tehwort.value
    //         findEntrys(tehwort,  {lang:'de', levenshtein_distance:0, printTime:true, top:3}).then(entries => {
    //             if (entries.length === 0) {
    //                 this.emit(':tell', `zoory echt, ich hab nichts gefunden für ${tehwort}`)
    //             }else {
    //                 let japanisch = entries[0].kana[0].romaji
    //                 japanisch = japanisch.toLowerCase()
    //                 japanisch = japanisch.replace('ie', 'iä')
    //                 japanisch = japanisch.replace('ji', 'dschy')
    //                 console.log(entries[0])
    //                 console.log(`${tehwort} auf japanisch ist: ${japanisch}. `)

    //                 this.emit(':tellWithCard', `${tehwort} auf japanisch ist: ${japanisch}. `, `${entries[0].kanji[0].text}: ${tehwort}`, `${tehwort}: ${entries[0].kanji[0].text} -  ${japanisch} `)

    //                 // this.emit(':tell', `${tehwort} auf japanisch ist: ${japanisch}. `)
    //             }
    //         })
            
    //     },

    //     'SessionEndedRequest': function () {
    //         this.emit(':tell', 'Tschausn!')
    //     }

    // }

    // alexa.registerHandlers(handlers)
    // alexa.execute()


    function returnText(text, card){
        const response = {
            version: '1.0',
            response: {
                outputSpeech: {
                    type: 'PlainText',
                    text: text
                },
            },
        }
        if (card) response.card = { type: "Simple", title: card.title, content: card.content}

        callback(null, response)
    }


    let request = event.request
    if (request.type === "IntentRequest" ) {
        const tehwort = event.request.intent.slots.tehwort.value
        findEntrys(tehwort,  {lang:'de', levenshtein_distance:0, printTime:true, top:1}).then(entries => {
            if (entries.length === 0) {
                returnText(`zoory echt, ich hab nichts gefunden für ${tehwort}`)
            }else {
                let japanisch = entries[0].kana[0].romaji
                japanisch = japanisch.toLowerCase()
                japanisch = japanisch.replace('ie', 'iä')
                japanisch = japanisch.replace('ji', 'dschy')
                console.log(entries[0])
                returnText(`${tehwort} auf japanisch ist: ${japanisch}. KAUFEN SIE JETZT:  INTERGALAKTISCHE PROTONENGETRIEBENE ELEKTRISCHE WACKELARMWERBEDROIDEN AUF  INTERGALAKTISCHEPROTONENGETRIEBENEELEKTRISCHEWACKELARMWERBEDROIDEN. D E . INTERGALAKTISCHE PROTONENGETRIEBENE ELEKTRISCHE WACKELARMWERBEDROIDEN!!!! DANKE! `,  { title: `${entries[0].kanji[0].text}: ${tehwort}`, content: `${tehwort}: ${entries[0].kanji[0].text} -  ${japanisch} `})
            }
        })
    }else if (request.type === "LaunchRequest" ){
        returnText('Wörterbuch geladen. Bitte, bitte fragen sie mich was, okeh??')
    }else if (request.type === "SessionEndedRequest" ){
        returnText('Sayoonara')
    }

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
