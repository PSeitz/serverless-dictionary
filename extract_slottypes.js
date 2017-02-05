let fs = require('fs')

function isASCII(str) {
    return /^[A-Za-zäüöß\s]*$/.test(str)
}


let goodwords = fs.readFileSync('de_50k.txt', 'utf-8').split('\n').map(word => word.split(' ')[0])
let words = fs.readFileSync('./jmdict/meanings.ger[].text', 'utf-8')
.split('\n')
// .filter(word => word.indexOf(' ') === -1)
// .filter(word => word.indexOf('.') === -1)
// .filter(word => word.indexOf(',') === -1)
.filter(isASCII)
.filter(word => normalizeText(word).every(wordPart => goodwords.indexOf(wordPart) >= 0))

console.log(words.length)
console.log(words[5000])

words = words.map(normalizeText)

while(words.length > 40000){
    let someWord = goodwords.pop()
    words = words.filter(wordParts => !(wordParts.length > 1 && wordParts.indexOf(someWord) >= 0))
    console.log(words.length)
}

words = words.map(wordParts => wordParts.join(" "))

console.log(words.length)
console.log(words[5000])

fs.writeFileSync('goodwords' , words.join('\n'))

function normalizeText(text){
    text = text.replace(/ *\([^)]*\) */g, ' ') // remove everything in braces
    text = text.replace(/[{}'"“]/g, '') // remove ' " {}
    text = text.replace(/\s\s+/g, ' ') // replace tabs, newlines, double spaces with single spaces
    text = text.replace(/[,.]/g, '') // remove , .
    text = text.replace(/[;・’-]/g, '') // remove ;・’-
    text = text.toLowerCase()
    return text.trim().split(' ')
}
// function flatten(arrays) {
//     return [].concat.apply([], arrays)
// }

// let dict = JSON.parse(fs.readFileSync('jmdict.json', 'utf-8'))
// dict = dict.sort(function(a,b){return b.commonness - a.commonness })

// let gerMeanings = dict.slice(0, 1000).map(entry => entry.meanings.ger)
// let asdf = flatten(gerMeanings).filter(el => el != undefined).map(ger => normalizeText(ger.text)).filter(text=> (text.split(' ').length>1 && text.split(' ').length<5))

// console.log(asdf[0])
