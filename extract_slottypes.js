let fs = require('fs')

function isASCII(str) {
    return /^[A-Za-zäüöß]*$/.test(str)
}



let goodwords = fs.readFileSync('de_50k.txt', 'utf-8').split('\n').map(word => word.split(' ')[0])

console.log(goodwords[500])


let words = fs.readFileSync('./jmdict/meanings.ger[]', 'utf-8')
.split('\n')
// .filter(word => word.indexOf(' ') === -1)
// .filter(word => word.indexOf('.') === -1)
// .filter(word => word.indexOf(',') === -1)
.filter(isASCII)
.filter(word => goodwords.indexOf(word.toLowerCase()) >= 0)

console.log(words.length)


console.log(words[5000])

fs.writeFileSync('goodwords' , words.join('\n'))