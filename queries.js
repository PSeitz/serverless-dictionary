'use strict'
process.env['PATH'] = process.env['PATH'] + ':' + process.env['LAMBDA_TASK_ROOT']
var sqlite3 = require('sqlite3').verbose()
var levenshtein = require('fast-levenshtein')
var _ = require('lodash')
let db = new sqlite3.Database('jmdict.sqlite', sqlite3.OPEN_READONLY)
db = Promise.promisifyAll(db)
const taim = require('taim')

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

class Meaning {
    constructor(text, language){
        this.text = text
        this.language = language
        this.pos
        this.type
    }
}

class Kana {
    constructor(text, Commonness, romaji){
        this.Commonness = Commonness
        this.text = text
        this.romaji = romaji
        this.hasnokanji
    }
}

class Kanji {
    constructor(text, Commonness){
        this.Commonness = Commonness
        this.text = text
        this.hasnokanji
        this.readings = []
    }
}

let usingKana = 'word usually written using kana alone'
let Languages = { 'ger':'ger', 'eng':'eng', 'hun':'hun', 'spa':'spa', 'slv':'slv', 'fre':'fre', 'dut':'dut' }

let langIdsMapping = {'eng':0, 'ger':1}

function getLanguageOrdering() {
    return [Languages.eng, Languages.ger]
}

function extract(array, property){
    let res = []
    for(let el of array){
        res.push(el[property])
    }
    return res
}

function prepareEntries(entries){
    for (let i = 0; i < entries.length; i++) {
        entries[i].prepare()
    }
}


class Entry {

    constructor(ent_seq, whyFound, query){
        this.ent_seq = ent_seq
        this.setWhyFound(whyFound)
        this.originalQuery = removeParentheses(query)
        this.misc = []
        this.kanjis = []
        this.kanas = []
        this.meanings = []
        this.commonness = null
    }

    setWhyFound(whyFound) {
        this.whyFound =  removeParentheses(whyFound)
    }

    getKanaForString(kana){
        return _.find(this.kanas, (kan)=> { return kan.text == kana })
    }

    isContainedInFirstKanji(searchterm){
        return  this.kanjis[0].text.includes(searchterm)
    }

    isFirstMeaningForLang(searchterm){
        for (let i = 0; i < this.meanings.length; i++) {
            if (this.meanings[i].text == searchterm) {
                if (i==0)return true
                else {
                    if (this.meanings[i-1].language != this.meanings[i].language)
                        return true
                    return false
                }
            }
        }
        return false
    }

    prepare() {
        if (this.originalQuery != null)
            this.exactMatch = this.originalQuery.toLowerCase() == this.whyFound.toLowerCase()

        this.sort()
        this.buildStrings()
        this.calcEntryCommonness()

        this.isWrittenInKana = this.misc.indexOf(usingKana) >= 0
        if (this.kanjis.length == 0) this.isWrittenInKana = true
    }

    getLevensthein_distance() {
        if (this.whyFound == null || this.originalQuery == null) return 0
//        if (levensthein_distance == null) levensthein_distance = levenshtein.get(removeParentheses(whyFound), originalQuery);
        if (this.levensthein_distance == null) this.levensthein_distance = levenshtein.get(this.whyFound, this.originalQuery)
        return this.levensthein_distance
    }

    getCommonness(){
        if (this.commonness === null) this.calcEntryCommonness()
        return this.commonness
    }

    calcEntryCommonness(){
        this.commonness = 0
        for (let i = 0; i < this.kanjis.length; i++) {
            this.commonness = Math.max(this.commonness, this.kanjis[i].Commonness)
        }
        for (let i = 0; i < this.kanas.length; i++) {
            this.commonness = Math.max(this.commonness, this.kanas[i].Commonness)
        }
    }

    sort(){
        function checkContainsNumber(string){
            for (var i = 0; i < 5; i++) {
                if (string.includes(i)) return i
            }
            return null
        }

        let languageOrdering = getLanguageOrdering()
        this.meanings.sort(function(m1, m2) {
            let prio1 = 100
            let prio2 = 100
            if (m1.language == m2.language){
                let num1 = checkContainsNumber(m1.text)
                if (num1) prio1 = num1
                let num2 = checkContainsNumber(m2.text)
                if (num2) prio2 = num2
                return  prio1 - prio2
            }else{
                prio1 = languageOrdering.indexOf(m1.language)
                prio2 = languageOrdering.indexOf(m2.language)
            }
            return  prio1 - prio2
        })

    }

    buildStrings(){
        this.meanings_str = extract(this.meanings, "text").join(", ")
        this.kanas_str = extract(this.kanas, "text").join(", ")
        this.misc_str = extract(this.misc, "text").join(", ")
    }
}

let KANJI_READINGS  = `SELECT kana from kanas WHERE _id in(
        SELECT kana_id from kanjis k
        JOIN kanji_readings r ON k._id = r.kanji_id
        WHERE kanji=? AND ent_seq=?)`


function addToEntry(ent_seqs, sqlquery, constructor, target, parameter1, parameter2 ){
    return db.allAsync(sqlquery).then(function(rows){
        for(let row of rows){
            let newValue =  new constructor(row.hit, row[parameter1], row[parameter2])
            ent_seqs[row.ent_seq][target].push(newValue)
        }
    }).error((err)=> {
        console.log(err)
    })
}

function getKanjis( ent_seqs) {
    let sqlquery = "SELECT kanji as hit, ent_seq, num_occurences FROM kanjis WHERE ent_seq IN ("+ Object.keys(ent_seqs).join(",") +")"
    return addToEntry(ent_seqs, sqlquery, Kanji, "kanjis", "num_occurences" )
}

function getKanas(ent_seqs) {
    let sqlquery = "SELECT kana as hit, ent_seq, num_occurences, romaji FROM kanas WHERE ent_seq IN ("+ Object.keys(ent_seqs).join(",") +")"
    return addToEntry(ent_seqs, sqlquery, Kana, "kanas", "num_occurences", "romaji" )
}

function getMeanings(ent_seqs, showGerman, showEnglish) {
    let sqlquery = "SELECT meaning as hit, ent_seq, lang FROM meanings WHERE ent_seq IN ("+ Object.keys(ent_seqs).join(",") +")"
    sqlquery = addLanguageFilter(sqlquery, showGerman, showEnglish)
    return addToEntry(ent_seqs, sqlquery, Meaning, "meanings", "lang" )
}

function findEntrys(searchterm, fuzzy, printTime, showGerman, showEnglish) {
    searchterm  = searchterm.trim()

    let adjustedSearchTerm = fuzzy?'%' + searchterm +'%':searchterm
    let startTime = process.hrtime()
    let searchTermSQL = "'"+adjustedSearchTerm+"'"
    let hit_entseq = {} // ent_seq : {String }

    let promises = []

    let method = fuzzy ? ' LIKE ' : '='
    let KANJI_QUERY = `SELECT kanji as hit, ent_seq FROM kanjis WHERE kanji ${method}${searchTermSQL}`
    let KANA_QUERY = `SELECT kana as hit, ent_seq FROM kanas WHERE kana ${method}${searchTermSQL}`
    
    let CONJUGATED_KANJI = `SELECT form as hit, ent_seq from kanjis k JOIN (SELECT kanji_id, form FROM kanji_conjugations WHERE form ${method}'${searchterm}') s ON s.kanji_id = k ._id`
    let CONJUGATED_KANA  = `SELECT form as hit, ent_seq from kanas k JOIN (SELECT kana_id, form FROM kana_conjugations WHERE form ${method}'${searchterm}') s ON s.kana_id = k ._id`

    function addQueries(queries){

        queries.forEach((query) => {promises.push(getEntryIds(hit_entseq, query, searchterm, printTime))})
    }

    let searchDb = require('serverless-search').searchDb()
    let query = {
            search: {
            term:'偉容',
            path:'kanji[].text',
            levenshtein_distance:0,
            firstCharExactMatch:true
        }
    }


    if (containsKanji(searchterm)){
        query = {
            search: {
                term: searchterm
                path:'kanji[].text',
                levenshtein_distance:0,
                firstCharExactMatch:true
            },
            boost: {
                path:'kanji[].commonness',
                fun:Math.log,
                param: 1
            }
        }
    }else if(containsKana(searchterm)){
        query = {
                search: {
                term: searchterm
                path:'kana[].text',
                levenshtein_distance:1,
                firstCharExactMatch:true
            },
            boost: {
                path:'kana[].commonness',
                fun:Math.log,
                param: 1
            }
        }
    }else {
        query = {
                search: {
                term: searchterm
                path:'kana[].text',
                levenshtein_distance:1,
                firstCharExactMatch:true
            },
            boost: {
                path:'kana[].commonness',
                fun:Math.log,
                param: 1
            }
        }
        
        let ROMAJI_QUERY = function(searchterm){return `SELECT romaji as hit, ent_seq FROM kanas WHERE romaji ${method}'${searchterm}'`}
        let MEANING_QUERY = function(searchterm){ 
            let query = `SELECT meaning as hit, ent_seq FROM meanings WHERE meaning ${method}${searchterm} `
            return addLanguageFilter(query, showGerman, showEnglish)
        }
        addQueries([ROMAJI_QUERY(searchterm), MEANING_QUERY(searchTermSQL)])
        if (showGerman && hasUmlautLikeCharacter(searchterm.toLowerCase())){
            let converted = convertUmlautLikeCharacter(searchterm.toLowerCase())
            let umlautConverted = "'"+fuzzy?('%' + converted +'%'):converted+"'"
            addQueries([ROMAJI_QUERY(umlautConverted), MEANING_QUERY(umlautConverted)])
        }
    }

    return searchDb.searchDb('jmdict', ).then(res => {
        // console.log(JSON.stringify(res, null, 2))
        return res
    })
    .should.eventually.have.length(1)


    if (printTime) taim('FindIds',Promise.all(promises))

    return Promise.all(promises).then(() => {
        return getEntries(hit_entseq, searchterm, printTime, showGerman, showEnglish)
    }).then((entries) => {

        entries.sort(function(result1, result2) {
            if (result1.getLevensthein_distance() == 0 &&  result2.getLevensthein_distance() != 0){
                return -1
            }else if (result1.getLevensthein_distance() != 0 &&  result2.getLevensthein_distance() == 0){
                return 1
            }else{
                let result1Commonness = result1.getCommonness()
                let result2Commonness = result2.getCommonness()
                if(containsKana(searchterm) && !containsKanji(searchterm)){
                    if (result1.isWrittenInKana && result1Commonness >0 && !result2.isWrittenInKana){
                        return -1
                    }
                    if (result2.isWrittenInKana && result2Commonness >0 && !result1.isWrittenInKana){
                        return 1
                    }
                }
                if (containsKanji){
                    if (result1.isContainedInFirstKanji(searchterm)) result1Commonness*=3
                    if (result2.isContainedInFirstKanji(searchterm)) result2Commonness*=3
                }else{
                    if (result1.isFirstMeaningForLang(searchterm)) result1Commonness*=3
                    if (result2.isFirstMeaningForLang(searchterm)) result2Commonness*=3
                }
                return result2Commonness - result1Commonness
            }
        })

        // if (entries.length > 250) entries.subList(250, entries.length).clear();
        if (entries.length > 250) entries.length = 250

        if (printTime){
            console.log('Query: ' +  process.hrtime(startTime)[1]/1000000 + ' ms.')
        }

        return entries

    })
    

}

function getEntryIds(hit_entseq, sqlquery, searchterm) {

    // sqlquery+='\''+args[0]+'\''

    return db.allAsync(sqlquery).then(function(rows){
        for(let row of rows){
            let hit = row.hit
            let ent_seq  = row.ent_seq

            if (hit_entseq[ent_seq]){
                let orig = hit_entseq[ent_seq].whyFound
                if (levenshtein.get(orig, searchterm) > levenshtein.get(hit, searchterm)){ //matches better
                    hit_entseq[ent_seq].setWhyFound(hit)
                }
            }else{
                hit_entseq[ent_seq] = new Entry(ent_seq, hit, searchterm)
            }
        }
        return rows
    }).error((err)=> {
        console.log(sqlquery)
        console.log(err)
    })

}
function addLanguageFilter(sqlquery, showGerman, showEnglish){
    if (showEnglish && showGerman) return sqlquery

    let langids = []
    if(showEnglish)langids.push(langIdsMapping[Languages.eng])
    if(showGerman)langids.push(langIdsMapping[Languages.ger])
    sqlquery += ' and lang IN ('+ langids.join(',')+')'
    return sqlquery

}

function getSuggestionsCursor(query, showGerman, showEnglish) {

    let promises = []
    if (containsKanji(query)){
        let sqlquery = 'SELECT _id, kanji as Suggest FROM kanjis WHERE kanji LIKE \''+query+'%\' '
        sqlquery = addLanguageFilter(sqlquery, showGerman, showEnglish)
        sqlquery+='group by kanji Order by num_occurences desc LIMIT 10'
        promises.push(db.allAsync(sqlquery))
    }
    if (containsKana(query)){
        let sqlquery = 'SELECT _id, kana as Suggest FROM kanas WHERE kana LIKE \''+query+'%\' '
        sqlquery = addLanguageFilter(sqlquery, showGerman, showEnglish)
        sqlquery+='group by kana Order by num_occurences desc LIMIT 10'
        promises.push(db.allAsync(sqlquery))
    }
    let sqlquery = 'SELECT _id, meaning as Suggest, count(meaning) as cnt FROM meanings WHERE meaning LIKE \''+query+'%\' '
    sqlquery = addLanguageFilter(sqlquery, showGerman, showEnglish)
    sqlquery+='group by meaning Order by cnt desc LIMIT 10'
    promises.push(db.allAsync(sqlquery))
    return Promise.all(promises)

}

function getSuggestions(query) {
    getSuggestionsCursor(query).then(function(rows){
        return rows
    })
}


function startSearch(){
    // findEntrys('Geisterhaus', true, true, true , true , true)
    findEntrys('book', true, true, true , true , true).then(function(entries){
        console.log(JSON.stringify(entries, null, 2))
    })
    // findEntrys('どうながたんそく', true, true, true , true , true)
    
}
startSearch()

exports.handler = (event, context, callback) => {

    let request = event.queryStringParameters
    // TODO implement
    findEntrys(request.searchterm, request.fuzzy, request.printTime, request.showGerman, request.showEnglish).then(function(entries){

        let response = {
            "statusCode": 200,
            "headers": { "Content-Type": "application/json; charset=utf-8" },
            "body": JSON.stringify(entries)
        }
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
