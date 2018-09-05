const loaderUtils = require('loader-utils'),
    glob = require('glob'),
    path = require('path'),
    minifier = require('html-minifier').minify,
    webpackSources = require('webpack-sources');

function minify(content, options) {
    content = content instanceof Buffer ? content.toString('utf8') : content;
    try {
        return minifier(content, options);
    } catch (e) {
        console.warn(e);
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
    let src = this.options.src, isMin = this.options.min, name = this.options.name || null, recurse = this.options.recurse, prefix = this.options.prefix || null,
        replaceBeforeName = this.options.replaceBeforeName || false,
        minifierOptions = Object.assign({
            collapseBooleanAttributes: true,
            collapseWhitespace: true,
            decodeEntities: true,
            minifyCSS: true,
            minifyJS: true,
            removeAttributeQuotes: true,
            removeComments: true,
            removeScriptTypeAttributes: true,
            removeStyleLinkTypeAttributes: true
        }, this.options.minifier);

    function generateName(name, filePath, fileContext) {
        let newFileName = name;
        if (newFileName) {
            if (newFileName.search('[name]')) {
                let currentName = path.basename(filePath), extFile = path.extname(currentName);
                newFileName = newFileName.replace('[name]', currentName.replace(extFile, ''));
            }
            if (newFileName.search('[hash]')) {
                newFileName = newFileName.replace('[hash]', loaderUtils.getHashDigest(fileContext));
            }
            if (newFileName.search('[timestamp]')) {
                newFileName = newFileName.replace('[timestamp]', Date.now());
            }
        } else {
            newFileName = path.basename(filePath);
        }
        return newFileName;
    }

    if (src) {
        compiler.plugin('compilation', (compilation) => {
            compilation.plugin('additional-assets', (callback) => {
                if (this.options.minChunks && compilation.chunks.length < this.options.minChunks) {
                    callback();
                    return;
                }

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

                    let context = this.options.context ? [path.resolve(this.options.context)] : compilation.entries.map(entry => entry.context);

                    /**
                     * Заменяет ресурсы
                     * @param source
                     * @returns {null | string} : null - если не было замены, иначе string
                     */
                    function replaceSource(source) {
                        let hasReplace = false;
                        source = source instanceof Buffer ? source.toString('utf8') : source;
                        let newSource = source.replace(srcReg, (...find) =>  {
                            let str = find[0], filePath;
                            context.some(entry => {
                                try {
                                    let need;
                                    let baseName = path.basename(str), normalSrt = path.normalize(str).replace(/\\/g, '/');;
                                    if (baseName in findFiles) {
                                        if (Array.isArray(findFiles[baseName])) {
                                            need = findFiles[baseName].find(it => it.endsWith(normalSrt));
                                        } else need = findFiles[baseName].endsWith(normalSrt) ? findFiles[baseName] : false;
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

                                let replacedContext = recurse ? replaceSource(fileContext) : null;
                                let newFileName = generateName(name, filePath, replaceBeforeName && replacedContext ? replacedContext : fileContext);
                                if (replacedContext) fileContext = replacedContext;
                                if (isMin) fileContext = minify(fileContext, minifierOptions);
                                compilation.assets[newFileName] = new webpackSources.RawSource(fileContext);
                                hasReplace = true;
                                if (prefix && str.startsWith(prefix)) newFileName = prefix + newFileName;
                                return newFileName;
                            } else return str;
                        });

                        return hasReplace ? newSource : null;
                    }

                    if (context.length) {
                        compilation.chunks.forEach(chunk => {
                            chunk.files.forEach(file => {
                                let source = replaceSource(compilation.assets[file].source());
                                if (source) compilation.assets[file] = new webpackSources.RawSource(source);
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