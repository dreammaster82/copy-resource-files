const loaderUtils = require('loader-utils'),
    glob = require('glob'),
    path = require('path'),
    minifier = require('html-minifier').minify,
    webpackSources = require('webpack-sources');

function minify(content) {
    content = content instanceof Buffer ? content.toString('utf8') : content;
    try {
        return minifier(content, {
            collapseBooleanAttributes: true,
            collapseWhitespace: true,
            decodeEntities: true,
            minifyCSS: true,
            minifyJS: true,
            removeAttributeQuotes: true,
            removeComments: true,
            removeScriptTypeAttributes: true,
            removeStyleLinkTypeAttributes: true
        });
    } catch (e) {
        console.warn(path);
        return content;
    }
};

function parseGlob(glob) {
    let str = glob.replace(/\*\*/g, '').replace(/[\+\-@]/g, '').replace(/\*/g, '[\\w\\-\\.\\/]+').replace(/\./g, '\.').replace(/\//g, '/?');
    return str;
};

function CopyResorceFiles(options) {
    this.options = options || {};
};

CopyResorceFiles.prototype.apply = function(compiler) {
    let src = this.options.src, isMin = this.options.min, name = this.options.name || null;
    if (src) {
        compiler.plugin('compilation', (compilation) => {
            compilation.plugin('additional-assets', (callback) => {
                glob(src, {root: this.options.root || compiler.context, ignore: this.options.ignore || null}, (err, files) => {
                    let srcReg = new RegExp(parseGlob(src), 'ig');
                    let findFiles = files.reduce((prev, file) => {
                        let basename = path.basename(file);
                        if (!prev[basename]) prev[basename] = file;
                        else if(Array.isArray(prev[basename])) {
                            prev[basename].push(file);
                        } else {
                            prev[basename] = [prev[basename]];
                        }
                        return prev;
                    }, {});

                    let context = compilation.entries.map(entry => entry.context);
                    if (context.length) {
                        compilation.chunks.forEach(chunk => {
                            chunk.files.forEach(file => {
                                let source = compilation.assets[file].source().replace(srcReg, (...find) =>  {
                                    let str = find[0], filePath;
                                    context.some(entry => {
                                        try {
                                            let need;
                                            let baseName = path.basename(str);
                                            if (baseName in findFiles) {
                                                if (Array.isArray(findFiles[baseName])) {
                                                    need = findFiles[baseName].find(it => it.endsWith(str));
                                                } else need = findFiles[baseName].endsWith(str) ? findFiles[baseName] : false;
                                            }
                                            if (need) {
                                                let resolve = path.resolve(entry, '../' + need)
                                                let stat = compiler.inputFileSystem.statSync(resolve);
                                                if (stat.isFile()) {
                                                    filePath = resolve;
                                                    return true
                                                }
                                            } else return false;
                                        } catch (e) {
                                            console.warn(e);
                                            return false;
                                        }
                                    });
                                    if (filePath) {
                                        let fileContext = compiler.inputFileSystem.readFileSync(filePath);
                                        let newFileName;
                                        if (name) {
                                            if (name.search('[hash]')) {
                                                newFileName = name.replace('[hash]', loaderUtils.getHashDigest(fileContext));
                                            }
                                        } else {
                                            newFileName = path.basename(filePath);
                                        }
                                        if (isMin) fileContext = minify(fileContext);
                                        compilation.assets[newFileName] = new webpackSources.RawSource(fileContext);
                                        return newFileName;
                                    } else return str;
                                });
                                compilation.assets[file] = new webpackSources.RawSource(source);
                            });
                        });
                    }

                    callback();
                });
            });
        });
    }
};

module.exports = CopyResorceFiles;