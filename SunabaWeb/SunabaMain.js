//何かと良く使う機能はHLibオブジェクトに入れる
var HLib = HLib || {};

//簡易的なassertもどき。
HLib.assert = function(f){
   if (f === false){
      throw 'BUG';
   }
};

///コールバックの引数はstring。失敗すればnull。
HLib.loadFileAsText = function(urlOrBlob, callback){
   if (urlOrBlob instanceof Blob){ //Blobだったら
      var reader = new FileReader(); //closure
      var onLoadEnd = function(){
         if (reader.error){
            callback(null);
         }else{
            callback(reader.result);
         }
      };
      reader.addEventListener('loadend', onLoadEnd, false);
      reader.readAsText(urlOrBlob);
   }else if ((typeof urlOrBlob) === 'string'){ //urlだったら
      var xhr = new XMLHttpRequest(); //closure
      xhr.open('get', urlOrBlob);
      xhr.responseType = 'text';
      var onLoadEnd = function(e){
         callback(xhr.response); //失敗ならnull
      };
      xhr.addEventListener('loadend', onLoadEnd, false);
      xhr.send();
   }
};

HLib.unicodeOf = function(string){
   return string.charCodeAt();
};

HLib.convertStringToUtf32Array = function(string){
   var r = [];
   var i;
   var l = string.length;
   for (i = 0; i < l; i += 1){
      r[r.length] = string.charCodeAt(i);
   }
   return r;
};

HLib.convertUtf32ArrayToString = function(array, begin, l){
   var r = '';
   begin = begin || 0;
   l = l || array.length;
   var i;
   for (i = 0; i < l; i += 1){
      r += String.fromCharCode(array[begin + i]);
   }
   return r;
};

HLib.isPowerOf2 = function(x){
   return (x & (x - 1)) === 0;
};

//配列オフセットつきコピー
HLib.copyArray = function(dst, dstOffset, src, srcOffset, count){
   for (var i = 0; i < count; i += 1){
      dst[dstOffset + i] = src[srcOffset + i];
   }
};

//エレメント内テキスト結合
HLib.concatenateTextInElement = function(e){
   var r = '';
   var c = e.firstChild;
   while (c){
      if (c.nodeType === c.TEXT_NODE){
         r += c.textContent;
      }
      c = c.nextSibling;
   }
   return r;
};

//Gpu
//Gpuクラス: 要するにGLを楽に使うためのラッパー
//コンストラクタ
//arg.canvas: 描くキャンバスか、そのid
HLib.Gpu = function(arg){
   //メンバ変数
   this.mGl = null; //WebGlRenderingContext
   this.mShader = null; //現在設定中のシェーダ
   this.mTexture = null; //現在設定中のテクスチャ
   this.mFullScreenVertexBuffer = null; //全画面描画用頂点バッファ
   //以下処理
   var canvas = arg.canvas;
   if ((typeof canvas) === 'string'){ //文字列なら引くよ
      canvas = document.getElementById(canvas);
   }
   var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl'); //後ろはIE用
   this.mGl = gl;
   //drawFullScreen用のデータ用意
   var vbData = new Float32Array(3 * 4); //3頂点4スカラ
   HLib.copyArray(vbData, 0, [-1, 3, 0, -arg.vEnd], 0, 4); //左上
   HLib.copyArray(vbData, 4, [-1, -1, 0, arg.vEnd], 0, 4); //左下
   HLib.copyArray(vbData, 8, [3, -1, 2 * arg.uEnd, arg.vEnd], 0, 4); //右下
   this.mFullScreenVertexBuffer = gl.createBuffer();
   gl.bindBuffer(gl.ARRAY_BUFFER, this.mFullScreenVertexBuffer);
   gl.bufferData(gl.ARRAY_BUFFER, vbData, gl.STATIC_DRAW);
   this.checkError();
   //頂点フォーマット
   gl.enableVertexAttribArray(0);
   gl.vertexAttribPointer(0, 4, gl.FLOAT, 0, 16, 0);
   this.checkError();
   //初期設定
   gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
   gl.clearColor(0, 0, 0, 1);
   gl.enable(gl.BLEND);
   gl.disable(gl.DEPTH_TEST);
   gl.clear(gl.COLOR_BUFFER_BIT);
   this.checkError();
};

HLib.Gpu.prototype.getGl = function(){
   return this.mGl;
};

HLib.Gpu.prototype.renderingWidth = function(){
   return this.mGl.drawingBufferWidth;
};

HLib.Gpu.prototype.renderingHeight = function(){
   return this.mGl.drawingBufferHeight;
};

HLib.Gpu.prototype.checkError = function(){
   var gl = this.mGl;
   var e = gl.getError();
   if (e !== gl.NO_ERROR){
      throw 'GL Error: ' + e;
   }
};

//クリアする。指定する色は0から1
//clear([0.2, 0.3, 0.4]);
//clear(0.2, 0.3, 0.4);
//clear(); //黒でクリア。
HLib.Gpu.prototype.clear = function(rOrArray, g, b){
   this.mGl.clear(gl.COLOR_BUFFER_BIT);
   this.checkError();
};

HLib.Gpu.prototype.setShader = function(shader){
   if (this.mShader !== shader){
      this.mShader = shader;
      //シェーダセット
      var program = this.mShader.getGlObject();
      this.mGl.useProgram(program);
      this.checkError();
   }
};

HLib.Gpu.prototype.setTexture = function(texture){
   this.mTexture = texture;
};

HLib.Gpu.prototype.draw = function(){
   if (!(this.mShader)){
      throw 'Gpu.draw(): call setShader().';
   }
   var gl = this.mGl;
   var program = this.mShader.getGlObject();
   gl.activeTexture(gl.TEXTURE0);
   gl.bindTexture(gl.TEXTURE_2D, this.mTexture.getGlObject());
   gl.drawArrays(gl.TRIANGLES, 0, 3);
};

//Shaderクラス。programを保持。頂点とフラグメントをセットにして生成する。
HLib.Shader = function(arg){
   //メンバ変数
   this.mGlObject = null; //program
   this.mGl = arg.gpu.getGl();
   //処理本体
   var gl = this.mGl;
   var vsElement = document.getElementById(arg.vertexShaderId);
   var fsElement = document.getElementById(arg.fragmentShaderId);
   var vsSrc = HLib.concatenateTextInElement(vsElement);
   var fsSrc = HLib.concatenateTextInElement(fsElement);
   var vs = gl.createShader(gl.VERTEX_SHADER);
   var fs = gl.createShader(gl.FRAGMENT_SHADER);
   var msg;
   gl.shaderSource(vs, vsSrc);
   gl.compileShader(vs);
   msg = gl.getShaderInfoLog(vs);
   if (msg.length > 0){
      throw msg;
   }
   gl.shaderSource(fs, fsSrc);
   gl.compileShader(fs);
   msg = gl.getShaderInfoLog(fs);
   if (msg.length > 0){
      throw msg;
   }
   this.mGlObject = gl.createProgram();
   gl.attachShader(this.mGlObject, vs);
   gl.attachShader(this.mGlObject, fs);
   gl.linkProgram(this.mGlObject);
   gl.validateProgram(this.mGlObject);
   msg = gl.getProgramInfoLog(this.mGlObject);
   if (msg.length > 0){
      throw msg;
   }
};

HLib.Shader.prototype.getGlObject = function(){
   return this.mGlObject;
};

//Textureクラス
//コンストラクタ
HLib.Texture = function(arg){
   //メンバ変数
   this.name = arg.name || ''; //名前。主にデバグ用。
   if (
   (HLib.isPowerOf2(arg.width) === false) ||
   (HLib.isPowerOf2(arg.height) === false)){
      throw 'MyLib.Texture() : サイズは2の累乗にしてね！'
   }
   this.width = arg.width;
   this.height = arg.height;

   this.mGlObject = null; //GLハンドル
   this.mGl = arg.gpu.getGl();
   //以下処理
   var gl = this.mGl; //たくさん使うので短く
   if (!gl){ //gpu先に初期化しろよ
      throw 'HLib.Texture() : Gpuクラスを渡してね！';
   }
   var img = arg.img; //画像指定あればそこから作るよ
   if ((typeof img) === 'string'){  //文字列ならidとみなして引く
      img = document.getElementById(img);
   }
   this.mGlObject = gl.createTexture();
   gl.bindTexture(gl.TEXTURE_2D, this.mGlObject);
   if (img){
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
   }else if (arg.data){
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, arg.width, arg.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, arg.data);
   }else{
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, arg.width, arg.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
   }
   var filter = (arg.pointSampling) ? gl.NEAREST : gl.LINEAR;
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
   //エラーチェック
   arg.gpu.checkError();
};

HLib.Texture.prototype.update = function(data){
   var gl = this.mGl; //たくさん使うので短く
   gl.bindTexture(gl.TEXTURE_2D, this.mGlObject);
   gl.texSubImage2D(
      gl.TEXTURE_2D,  //target
      0, //level
      0, //xoffset
      0, //yoffset
      this.width,
      this.height,
      gl.RGBA, //format
      gl.UNSIGNED_BYTE, //type
      data); //pixels
};

HLib.Texture.prototype.getGlObject = function(){
   return this.mGlObject;
};

//Sunaba固有処理はSunabaオブジェクトに入れる
var Sunaba = Sunaba || {};

Sunaba.MAX_ABS_NUMBER = 2147483647; //2^31 - 1

//識別子に含まれる文字か否か
Sunaba.isInName = function(code){
   return (code === '@'.charCodeAt()) ||
      (code === '$'.charCodeAt()) ||
      (code === '&'.charCodeAt()) ||
      (code === '?'.charCodeAt()) ||
      (code === '_'.charCodeAt()) ||
      (code === '\''.charCodeAt()) ||
      ((code >= 'a'.charCodeAt()) && (code <= 'z'.charCodeAt())) ||
      ((code >= 'A'.charCodeAt()) && (code <= 'Z'.charCodeAt())) ||
      ((code >= '0'.charCodeAt()) && (code <= '9'.charCodeAt())) ||
      (code >= 0x100); //マルチバイト文字は全てオーケー。半角相当品がある全角は置換済み。
};

Sunaba.readKeyword = function(s, loc){
   var r;
   if (s === 'while'){
      r = 'WHILE_PRE';
   }else if ((s === loc.whileWord0) || (s === loc.whileWord1)){
      r = (loc.whileAtHead) ? 'WHILE_PRE' : 'WHILE_POST';
   }else if (s === 'if'){
      r = 'IF_PRE';
   }else if (s === loc.ifWord){
      r = (loc.ifAtHead) ? 'IF_PRE' : 'IF_POST';
   }else if (s === 'def'){
      r = 'DEF_PRE';
   }else if (s === loc.defWord){
      r = (loc.defAtHead) ? 'DEF_PRE' : 'DEF_POST';
   }else if ((s === 'const') || (s === loc.constWord)){
      r = 'CONST';
   }else if ((s === 'out') || (s === loc.outWord)){
      r = 'OUT';
   }else{
      r = null;
   }
   return r;
};

Sunaba.readInstruction = function(s){
   //線形検索だけどコードが短い方を選んだ。ハッシュにしても良い。
   var table = ['i', 'add', 'sub', 'mul', 'div', 'lt', 'le', 'eq', 'ne',
      'ld', 'st', 'fld', 'fst', 'j', 'bz', 'call', 'ret', 'pop' ];
   var n = table.length;
   for (var i = 0; i < n; i += 1){
      if (s === table[i]){
         return table[i];
      }
   }
   return null;
};

//マイナスも読めます(主に速度とデバグのために)
Sunaba.readNumber = function(code, begin, l){
   //前提。lは0じゃない。空白は混ざっていない。
   var r = 0;
   var i = 0;
   var minus = false;
   if (code[begin + i] === '-'.charCodeAt()){ //マイナスですね
      i += 1;
      minus = true;
   }
   var u0 = '0'.charCodeAt();
   var u9 = '9'.charCodeAt();
   var decimalExist = false;
   while (i < l){
      r *= 10;
      var c = code[begin + i];
      if ((c >= u0) && (c <= u9)){
         r += c - u0;
         decimalExist = true;
      }else{
         break;
      }
      i += 1;
   }
   if (decimalExist){ //数字が存在している
      r = (minus) ? -r : r;
   }else{
      r = null; //数字がなかった。nullを返す。
   }
   return r;
};

//Sunaba.Locale
Sunaba.locales = {
   japanese:{
      whileWord0: 'なかぎり',
      whileWord1: 'な限り',
      whileAtHead: false,
      ifWord: 'なら',
      ifAtHead: false,
      defWord: 'とは',
      defAtHead: false,
      constWord: '定数',
      outWord: '出力',
      memoryWord: 'メモリ',
      argDelimiter: '、' } }; //TODO: 韓国語と中国語

//Sunaba.Parser
Sunaba.Parser = function(tokens, locale){
   this.errorMessage = null;

   this.mTokens = tokens;
   this.mLocale = locale;
   this.mConstants = {};
   this.mRoot = null;
   this.mPos = 0;
};

//Program : (Const | FuncDef | Statement )*
Sunaba.Parser.prototype.parseProgram = function(){
   //定数マップにmemoryの類を登録
   this.mConstants.memory = 0;
   var memoryWord = this.mLocale.memoryWord;
   this.mConstants[memoryWord] = 0;
   var node = {type:'PROGRAM', child:null, brother:null};
   //定数全て処理
   var tokens = this.mTokens;
   var n = tokens.length;
   this.mPos = 0;
   while (tokens[this.mPos].type !== 'END'){
      var t = tokens[this.mPos];
      if (t.type === 'CONST'){
         if (!this.parseConst(false)){ //ノードを返さない。
            return null;
         }
      }else{
         this.mPos += 1;
      }
   }
   //残りを処理
   this.mPos = 0;
   var lastChild = null;
   while (tokens[this.mPos].type !== 'END'){
      var statementType = this.getStatementType();
      var child = null;
      if (statementType === null){
         return null;
      }else if (statementType === 'CONST'){ //定数は処理済みなのでスキップ
         if (!this.parseConst(true)){
            return null;
         }
      }else{
         if (statementType === 'DEF'){
            child = this.parseFunctionDefinition();
         }else{
            child = this.parseStatement();
         }
         if (child === null){
            return null;
         }else if (!lastChild){
            node.child = child;
         }else{
            lastChild.brother = child;
         }
         lastChild = child;
      }
   }
   return node;
};

//Const : const name -> expression;
//ノードを生成しないので、boolを返す。
Sunaba.Parser.prototype.parseConst = function(skipFlag){
   var tokens = this.mTokens;
   var t = tokens[this.mPos];
   HLib.assert(t.type === 'CONST');
   this.mPos += 1;
   //名前
   t = token[this.mPos];
   if (t.type !== 'NAME'){
      this.errorMessage += '行' + t.line + ': 「定数」の次は、その名前であるはずだが、「' + t.string + '」がある。';
      return false;
   }
   var constName = t.name;
   this.mPos += 1;
   //→
   t = token[this.mPos];
   if (t.type !== '→'){
      this.errorMessage += '行' + t.line + ': 「定数 名前」の次は「→」のはずだが、「' + t.string + '」がある。';
      return false;
   }
   this.mPos += 1;
   //Expression
   var expression = this.parseExpression();
   if (expression === null){
      return false;
   }
   if (expression.type !== 'NUMBER'){ //解決済みでなければ定数には使えない
      this.errorMessage += '行' + t.line + ': 定数の右辺の計算に失敗した。メモリ、名前付きメモリ、部分プログラム参照は使えないよ？';
      return false;
   }
   var constValue = expression.number;
   this.mPos += 1;
   //文末
   t = token[this.mPos];
   if (t.type !== ';'){
      this.errorMessage += '行' + t.line + ': 定数行の最後に、「' + t.string + '」がある。改行してくれ。';
      return false;
   }
   this.mPos += 1;
   //マップに登録
   if (!skipFlag){
      if (this.mConstants[constName]){ //もうある
         this.errorMessage += '行' + t.line + ': 定数「' + constName + '」はすでに作られている。';
         return false;
      }
      this.mConstants[constName] = constValue;
   }
   return true;
};

//FunctionDefinition : name ( name? [ , name ]* ) とは [{ statement* }]
//FunctionDefinition : def name ( name? [ , name ]* ) [{ statement* }]
Sunaba.Parser.prototype.parseFunctionDefinition = function(){
   //defスキップ
   var tokens = this.mTokens;
   var t = tokens[this.mPos];
   var defFound = false;
   if (t.type === 'DEF_PRE'){
      this.mPos += 1;
      defFound = true;
      t = tokens[this.mPos];
   }
   //ノード準備
   var node = {type:'FUNC_DEF', token:t, child:null, brother:null};
   this.mPos += 1;

   //(
   t = tokens[this.mPos];
   if (t.type !== '('){
      this.errorMessage += '行' + t.line + ': 入力リスト開始の「(」があるはずだが、「' + t.string + '」がある。';
      return null;
   }
   this.mPos += 1;

   //次がnameなら引数が一つはある
   var lastChild = null;
   t = tokens[this.mPos];
   if (t.type === 'NAME'){
      var arg = this.parseVariable();
      if (arg === null){
         return null;
      }
      node.child = arg;
      lastChild = arg;
      //第二引数以降を処理
      while (tokens[this.mPos].type === ','){
         this.mPos += 1;
         t = tokens[this.mPos];
         if (t.type !== 'NAME'){ //名前でないのはエラー
            this.errorMessage += '行' + t.line + ': 入力リスト中に「,」がある以上、まだ入力があるはずだが、「' + t.string + '」がある。';
            return null;
         }
         arg = this.parseVariable();
         if (arg === null){
            return null;
         }
         //引数名が定数なのは許さない
         t = tokens[this.mPos];
         if (arg.type === 'NUMBER'){ //定数は構文解析中に解決されてNUMBERになってしまう。
            this.errorMessage += '行' + t.line + ': 定数と同じ名前は入力につけられない。';
            return null;
         }
         lastChild.brother = arg;
         lastChild = arg;
      }
   }
   //)
   t = tokens[this.mPos];
   if (t.type !== ')'){
      this.errorMessage += '行' + t.line + ': 入力リスト終了の「)」があるはずだが、「' + t.string + '」がある。';
      return null;
   }
   this.mPos += 1;

   //とは
   t = tokens[this.mPos];
   if (t.type === 'DEF_POST'){
      if (defFound){
         this.errorMessage += '行' + t.line + ': 「def」と「とは」が両方ある。片方にしてほしい。';
      }
      defFound = true;
      this.mPos += 1;
   }

   //関数定義の中身
   t = tokens[this.mPos];
   if (t.type === '{'){
      this.mPos += 1;
      t = tokens[this.mPos];
      while (true){
         var child = null;
         if (t.type === '}'){ //終わり
            this.mPos += 1;
            break;
         }else if (t.type === 'CONST'){ //定数は関数定義の中では許しませんよ
            this.errorMessage += '行' + t.line + ': 部分プログラム内で定数は作れない。';
            return null;
         }else{
            child = this.parseStatement();
            if (child === null){
               return null;
            }
         }
         if (lastChild !== null){
            lastChild.brother = child;
         }else{
            node.child = child;
         }
         lastChild = child;
      }
   }else if (t.type === ';'){ //いきなり空
      this.mPos += 1;
   }else{ //エラー
      this.errorMessage += '行' + t.line + ': 部分プログラムの最初の行の行末に「' + t.string + '」が続いている。改行しよう。';
      return null;
   }
   return node;
};

//Statement : ( while | if | return | funcDef | func | set )
Sunaba.Parser.prototype.parseStatement = function(){
   var statementType = this.getStatementType();
   var node = null;
   var t = null;
   if (statementType === 'WHILE_OR_IF'){
      node = this.parseWhileOrIfStatement();
   }else if (statementType === 'DEF'){ //これはエラー
      t = this.mTokens[this.mPos];
      this.errorMessage += '行' + t.line + ': 部分プログラム内で部分プログラムは作れない。';
      return null;
   }else if (statementType === 'CONST'){ //これはありえない
      throw 'BUG';
   }else if (statementType === 'FUNC'){ //関数呼び出し文
      node = this.parseFunction();
      if (node === null){
         return null;
      }
      t = this.mTokens[this.mPos];
      if (t.type !== ';'){ //文終わってないぞ
         if (t.type === '{'){
            this.errorMessage += '行' + t.line + ': 部分プログラムを作ろうとした？それは部分プログラムの外で「def」なり「とは」なりを使ってね。それとも、次の行の字下げが多すぎただけ？';
         }else{
            this.errorMessage += '行' + t.line + ': 部分プログラム参照の後ろに、「' + t.string + '」がある。改行したら？';
         }
         return null;
      }
      this.mPos += 1;
   }else if (statementType === 'SET'){ //代入
      node = this.parseSetStatement();
   }else if (statementType === null){ //不明。エラー文字列は作ってあるので上へ
      return null;
   }else{
      throw 'BUG';
   }
   return node;
};

//文タイプを判定
//DEF, FUNC, WHILE_OR_IF, CONST, SET, nullのどれかが返る。メンバは変更しない。
Sunaba.Parser.prototype.getStatementType = function(){
   var pos = this.mPos; //コピーを作ってこっちをいじる。オブジェクトの状態は変えない。
   var tokens = this.mTokens;
   var t = tokens[pos];
   //文頭でわかるケースを判別
   if (t.type === '{'){
      this.errorMessage += '行' + t.line + ': 字下げを間違っているはず。上の行より多くないか。';
      return null;
   }else if ((t.type === 'WHILE_PRE') || (t.type === 'IF_PRE')){
      return 'WHILE_OR_IF';
   }else if (t.type === 'DEF'){
      return 'DEF';
   }else if (t.type === 'CONST'){
      return 'CONST';
   }
   //文末までスキャン
   var endPos = pos;
   while ((tokens[endPos].type !== ';') && (tokens[endPos].type !== '{')){
      endPos += 1;
   }
   //後置キーワード判定
   if (endPos > pos){
      t = tokens[endPos - 1];
      if ((t.type === 'WHILE_POST') || (t.type === 'IF_POST')){
         return 'WHILE_OR_IF';
      }else if (t.type === 'DEF_POST'){
         return 'DEF';
      }
   }
   //代入記号を探す
   var i;
   for (i = pos; i < endPos; i += 1){
      if (tokens[i].type === '→'){
         return '→';
      }
   }
   //残るは関数コール文?
   if ((tokens[pos].type === 'NAME') && (tokens[pos + 1].type === '(')){
      return 'FUNC';
   }
   //解釈不能。ありがちなのは「なかぎり」「なら」の左に空白がないケース
   this.errorMessage += '行' + t.line + ': 解釈できない。注釈は//じゃなくて#だよ？あと、「なかぎり」「なら」の前には空白ある？それと、メモリセットは=じゃなくて→だよ？';
   //TODO: どんなエラーか推測してやれ
   //TODO: 後ろにゴミがあるくらいなら無視して進む手もあるが、要検討
   return null;
};

//Set: [out | memory | name | array] → expression ;
Sunaba.Parser.parseSetStatement = function(){
   //
   var tokens = this.mTokens;
   var t = tokens[this.mPos];
   if ((t.type !== 'NAME') && (t.type !== 'OUT')){
      this.errorMessage += '行' + t.line + ': 「→」があるのでメモリセット行だと思うが、それなら「memory」とか「out」とか、名前付きメモリの名前とか、そういうものから始まるはず。'
      return null;
   }
   var node = {type:'SET', token:t, child:null, brother:null};
   //左辺
   var left = null;
   if (t.type === 'OUT'){
      left = {type:'OUT', token:t, child:null, brother:null};
      this.mPos += 1;
   }else{ //第一要素はNAME
      if (tokens[this.mPos + 1].type === '['){ //配列だ
         left = this.parseArray();
      }else{ //変数
         left = this.parseVariable();
         if (left.type === 'NUMBER'){ //定数じゃん！
            this.errorMessage += '行' + t.line + ': ' + left.string + 'は定数で、セットできない。';
            return null;
         }
      }
   }
   if (left === null){
      return null;
   }
   node.child = left;
   //→
   t = tokens[this.mPos];
   if (t.type !== '→'){
      this.errorMessage += '行' + t.line + ': メモリセット行だと思ったのだが、あるべき場所に「→」がない。';
      return null;
   }
   this.mPos += 1;

   //右辺は式
   var right = this.parseExpression();
   if (right === null){
      return null;
   }
   left.brother = right;

   //;
   t = tokens[this.mPos];
   if (t.type !== ';'){
      this.errorMessage += '行' + t.line + ': 次の行の字下げが多すぎるんじゃなかろうか。';
      return null;
   }
   this.mPos += 1;
   return node;
};

//while|if expression [ { } ]
//while|if expression;
//expression while_post|if_post [ { } ]
//expression while_post|if_post ;
Sunaba.Parser.parseWhileOrIfStatement = function(){
   var tokens = this.mTokens;
   var t = tokens[this.mPos];
   var node = {type:null, token:t, child:null, brother:null};
   //前置ならすぐ決まる
   if (t.type === 'WHILE_PRE'){
      node.type = 'WHILE';
      this.mPos += 1;
   }else if (t.type === 'IF_PRE'){
      node.type = 'IF';
      this.mPos += 1;
   }
   //条件式
   var exp = this.expression();
   if (exp === null){
      return null;
   }
   node.child = exp;

   //まだどっちか確定してない場合、ここにキーワードがあるはず
   t = tokens[this.mPos];
   if (node.type === null){
      if (t.type === 'WHILE_POST'){
         node.type = 'WHILE';
      }else if (t.type === 'IF_POST'){
         node.type = 'IF';
      }
      this.mPos += 1;
   }
   //ブロックがあるなら処理
   t = tokens[this.mPos];
   if (t.type === '{'){
      this.mPos += 1;
      var lastChild = exp;
      while (true){
         var child = null;
         t = tokens[this.mPos];
         if (t.type === '}'){
            this.mPos += 1;
            break;
         }else if (t.type === 'CONST'){
            this.errorMessage += '行' + t.line + ': 繰り返しや条件実行の中で定数は作れない。';
            return null;
         }else{
            child = this.parseStatement();
         }
         if (child === null){
            return null;
         }
         lastChild.brother = child;
         lastChild = child;
      }
   }else if (t.type === ';'){ //中身なしwhile/if
      this.mPos += 1;
   }else{
      this.errorMessage += '行' + t.line + ': 条件行は条件の終わりで改行しよう。「' + t.string + '」が続いている。';
      return null;
   }
   return node;
};

//Array : name [ expression ]
Sunaba.Parser.prototype.parseArray = function(){
   var node = this.parseVariable();
   if (node === null){
      return null;
   }
   node.type = 'ARRAY';
   //[
   HLib.assert(this.mTokens[this.mPos].type === '['); //getTermTypeで判定済み
   //expression
   var exp = this.parseExpression();
   if (exp === null){
      return null;
   }
   node.child = expression;
   //expressionが数値ならアドレス計算を済ませてしまう
   if (exp.type === 'NUMBER'){
      node.number += expression.number;
      node.child = null; //expression破棄
   }
   //]
   if (this.mTokens[this.mPos].type !== ']'){
      this.errorMessage += '行' + t.line + ': 名前つきメモリ[番号]の"]"の代わりに「' + t.string + '」がある。';
      return null;
   }
   this.mPos += 1;
   return node;
};

//Variable : name
Sunaba.Parser.prototype.parseVariable = function(){
   var t = this.mTokens[this.mPos];
   HLib.assert(t.type === 'NAME');
   var node = {type:null, token:t, child:null, brother:null};
   //定数？変数？
   var c = this.mConstants[t.string];
   if (typeof c !== 'undefined'){
      node.type = 'NUMBER';
      node.number = c;
   }else{
      node.type = 'VARIABLE';
   }
   this.mPos += 1;
   return node;
};

//Out : out
Sunaba.Parser.prototype.parseOut = function(){
   var t = this.mTokens[this.mPos];
   HLib.assert(t.type === 'OUT');
   var node = {type:'OUT', token:t, child:null, brother:null};
   this.mPos += 1;
   return node;
};

//Expression : expression +|-|*|/|<|>|≤|≥|≠|= expression
Sunaba.Parser.prototype.parseExpression = function(){
   //左結合の木をボトムアップで作る。途中で回転することもある。
   //最初の左ノード
   var left = this.parseTerm();
   if (left === null){
      return null;
   }
   //演算子がつながる限りループ
   var t = this.mTokens[this.mPos];
   while (t.type === 'OPERATOR'){
      var node = {
         type:'EXPRESSION',
         token:t,
         operator:t.operator,
         child:null,
         brother:null};
      this.mPos += 1;
      t = this.mTokens[this.mPos];
      if ((t.type === 'OPERATOR') && (t.operator !== '-')){ //-以外の演算子ならエラー
         this.errorMessage += '行' + t.line + ': 演算子が連続している。==や++や--はない。=>や=<は>=や<=の間違いだろう。';
         return null;
      }
      var right = this.parseTerm();
      if (right === null){
         return null;
      }
      //GT,GEなら左右交換して不等号の向きを逆に
      if ((node.operator === '>') || (node.operator === '≥')){
         var tmp = left;
         left = right;
         right = tmp;
         if (node.operator === '>'){
            node.operator = '<';
         }else{
            node.operator = '≤';
         }
      }
      //最適化。定数の使い勝手向上のために必須 TODO:a + 2 + 3がa+5にならないよねこれ
      var preComputed = null;
      if ((left.type === 'NUMBER') && (right.type === 'NUMBER')){
         var a = left.number;
         var b = right.number;
         if (node.operator === '+'){
            preComputed = a + b;
         }else if (node.operator === '-'){
            preComputed = a - b;
         }else if (node.operator === '*'){
            preComputed = a * b;
         }else if (node.operator === '/'){
            preComputed = Math.floor(a / b); //整数化必須
         }else if (node.operator === '<'){
            preComputed = (a < b) ? 1 : 0;
         }else if (node.operator === '≤'){
            preComputed = (a <= b) ? 1 : 0;
         }else if (node.operator === '='){
            preComputed = (a === b) ? 1 : 0;
         }else if (node.operator === '≠'){
            preComputed = (a !== b) ? 1 : 0;
         }else{
            throw 'BUG'; //>と≥は上で置換されてなくなっている
         }
      }
      if (preComputed !== null){ //事前計算でノードをマージ
         node.type = 'NUMBER';
         node.number = preComputed;
      }else{
         node.child = left;
         left.brother = right;
      }
      //現ノードを左の子として継続
      left = node;
   }
   return left;
};

Sunaba.Parser.prototype.getTermType = function(){
   var t = this.mTokens[this.mPos];
   var r = null;
   if (t.type === '('){
      r = 'EXPRESSION';
   }else if (t.type === 'NUMBER'){
      r = 'NUMBER';
   }else if (t.type === 'NAME'){
      t = this.mTokens[this.mPos + 1];
      if (t.type === '('){
         r = 'FUNC';
      }else if (t.type === '['){
         r = 'ARRAY';
      }else{
         r = 'VARIABLE';
      }
   }else if (t.type === 'OUT'){
      r = 'OUT';
   }
   return r;
};

//Term : [-] function|variable|out|array|number|(expression)
Sunaba.Parser.prototype.parseTerm = function(){
   var t = this.mTokens[this.mPos];
   var minus = false;
   if (t.operator === '-'){
      minus = true;
      this.mPos += 1;
   }
   t = this.mTokens[this.mPos];
   var termType = this.getTermType();
   var node = null;
   if (termType === 'EXPRESSION'){
      HLib.assert(t.type === '(');
      this.mPos += 1;
      node = this.parseExpression();
      t = this.mTokens[this.mPos];
      if (t.type !== ')'){
         this.errorMessage += '行' + t.line + ': ()で囲まれた式がありそうなのだが、終わりの")"の代わりに「' + t.string + '」がある。';
         return null;
      }
      this.mPos += 1;
   }else if (termType === 'NUMBER'){
      node = {type:'NUMBER', number:t.number, token:t, child:null, brother:null};
      this.mPos += 1;
   }else if (termType === 'FUNC'){
      node = this.parseFunction();
   }else if (termType === 'ARRAY'){
      node = this.parseArray();
   }else if (termType === 'VARIABLE'){
      node = this.parseVariable();
   }else if (termType === 'OUT'){
      node = this.parseOut();
   }else{
      this.errorMessage += '行' + t.line + ': ここには、()で囲まれた式、memory[]、数、名前つきメモリ、部分プログラム参照、のどれかがあるはずなのだが、代わりに「' + t.string + '」がある。';
   }
   if ((node !== null) && minus){
      if (node.type === 'NUMBER'){ //この場で反転
         node.number = -(node.number);
      }else{ //反転は後に伝える
         node.negation = true;
      }
   }
   return node;
};

//Function : name ( [ expression [ , expression ]* ] )
Sunaba.Parser.prototype.parseFunction = function(){
   var t = this.mTokens[this.mPos];
   HLib.assert(t.type === 'NAME');
   var node = {type:'FUNC', token:t, child:null, brother:null};
   this.mPos += 1;

   //(
   t = this.mTokens[this.mPos];
   HLib.assert(t.type === '(');
   this.mPos += 1;

   //引数ありか、なしか
   t = this.mTokens[this.mPos];
   if (t.type !== ')'){ //括弧閉じないので引数あり
      var exp = this.parseExpression();
      if (exp === null){
         return null;
      }
      node.child = exp;

      //2個目以降はループで取る
      var lastChild = exp;
      while (true){
         t = this.mTokens[this.mPos];
         if (t.type !== ','){
            break;
         }
         this.mPos += 1;
         exp = this.parseExpression();
         if (exp === null){
            return null;
         }
         lastChild.brother = exp;
         lastChild = exp;
      }
   }
   //)
   if (t.type !== ')'){
      this.errorMessage += '行' + t.line + ': 部分プログラムの入力が")"で終わるはずだが、「' + t.string + '」がある。';
      return null;
   }
   this.mPos += 1;
   return node;
};

//Sunaba.Compiler
Sunaba.Compiler = function(){
};

//SPEC_CHANGE:タブは8個のスペースとして解釈する
//全角スペースは半角2個へ
Sunaba.Compiler.unifySpace = function(code){
   var r = [];
   var i, j;
   var l = code.length;
   var SPACE = ' '.charCodeAt();
   var TAB = '\t'.charCodeAt();
   var ZSPACE = '　'.charCodeAt(); //全角スペース
   for (i = 0; i < l; i += 1){
      if (code[i] === TAB){
         for (j = 0; j < 8; j += 1){
            r[r.length] = SPACE;
         }
      }else if (code[i] === ZSPACE){
         r[r.length] = SPACE;
         r[r.length] = SPACE;
      }else{
         r[r.length] = code[i];
      }
   }
   return r;
};

//全てCR,CRLFをLFに変換。
/*
[モード表]
0 非改行文字の上
1 \rの上

[モード遷移]
0 \r 1
0 * 0 out(*)
1 \n 0 out(\n)
1 \r 1 out(\n)
1 * 0 out(\n),out(*)
*/
Sunaba.Compiler.unifyNewLine = function(code){
   var r = [];
   var mode = 0;
   var i;
   var l = code.length;
   var SPACE = ' '.charCodeAt();
   var CR = '\r'.charCodeAt();
   var LF = '\n'.charCodeAt();
   for (i = 0; i < l; i += 1){
      var c = code[i];
      if (mode === 0){
         if (c === CR){
            mode = 1;
         }else{
            r[r.length] = c;
         }
      }else if (mode === 1){
         if (c === LF){
            r[r.length] = LF;
            mode = 0;
         }else if (c === CR){
            r[r.length] = LF;
         }else{
            r[r.length] = LF;
            r[r.length] = c;
            mode = 0;
         }
      }else{
         throw 'BUG';
      }
   }
   return r;
};

/*
1.対応する半角文字がある全角文字を全て半角にする
2.制御文字は捨てる
*/
Sunaba.Compiler.replaceChar = function(code, loc){
   var r = [];
   var i;
   var l = code.length;
   var u = function(string){ //1文字目のunicodeを返す関数を短く定義
      return string.charCodeAt();
   };
   var LOC_ARG_DELIM = null;
   if (loc.argDelimiter){ //関数引数区切り文字ローカライズ
      LOC_ARG_DELIM = u(loc.argDelimiter);
   }
   for (i = 0; i < l; i += 1){
      var c = code[i];
      var o = null; //出力文字
      if ((c >= u('Ａ')) && (c <= u('Ｚ'))){
         o = u('A') + (c - u('Ａ'));
      }else if ((c >= u('ａ')) && (c <= u('ｚ'))){
         o = u('a') + (c - u('ｚ'));
      }else if ((c >= u('０')) && (c <= u('９'))){
         o = u('0') + (c - u('０'));
      }else if (c === u('\n')){ //改行は残す
         o = c;
      }else if ((c < 0x20) || (c === 0x7f)){
         ; //0から0x1fまでの制御コードとdelを捨てる。ただし\nは上で処理済み。
      }else if (c === LOC_ARG_DELIM){ //言語ごとの区切り文字
         o = u(',');
      //ASCII範囲
      }else if (c === u('！')){ //0x21
         o = u('!');
      }else if (c === u('”')){ //0x22
         o = u('\"');
      }else if (c === u('＃')){ //0x23
         o = u('#');
      }else if (c === u('＄')){ //0x24
         o = u('$');
      }else if (c === u('％')){ //0x25
         o = u('%');
      }else if (c === u('＆')){ //0x26
         o = u('&');
      }else if (c === u('’')){ //0x27
         o = u('\'');
      }else if (c === u('（')){ //0x28
         o = u('(');
      }else if (c === u('）')){ //0x29
         o = u(')');
      }else if (c === u('＊')){ //0x2a
         o = u('*');
      }else if (c === u('＋')){ //0x2b
         o = u('+');
      }else if (c === u('，')){ //0x2c
         o = u(',');
      }else if (c === u('－')){ //0x2d
         o = u('-');
      }else if (c === u('．')){ //0x2e
         o = u('.');
      }else if (c === u('／')){ //0x2f
         o = u('/');
      }else if (c === u('：')){ //0x3a
         o = u(':');
      }else if (c === u('；')){ //0x3b
         o = u(';');
      }else if (c === u('＜')){ //0x3c
         o = u('<');
      }else if (c === u('＝')){ //0x3d
         o = u('=');
      }else if (c === u('＞')){ //0x3e
         o = u('>');
      }else if (c === u('？')){ //0x3f
         o = u('?');
      }else if (c === u('＠')){ //0x40
         o = u('@');
      }else if (c === u('［')){ //0x5b
         o = u('[');
      }else if (c === u('＼')){ //0x5c
         o = u('\\');
      }else if (c === u('］')){ //0x5d
         o = u(']');
      }else if (c === u('＾')){ //0x5e
         o = u('^');
      }else if (c === u('＿')){ //0x5f
         o = u('_');
      }else if (c === u('‘')){ //0x60
         o = u('`');
      }else if (c === u('｛')){ //0x7b
         o = u('{');
      }else if (c === u('｜')){ //0x7c
         o = u('|');
      }else if (c === u('｝')){ //0x7d
         o = u('}');
      }else if (c === u('～')){ //0x7e
         o = u('~');
      //その他
      }else if (c === u('×')){
         o = u('*');
      }else if (c === u('÷')){
         o = u('/');
      }else if (c === u('≧')){  //日本特有のものを世界的にメジャーなものに変換
         o = u('≥');
      }else if (c === u('≦')){  //日本特有のものを世界的にメジャーなものに変換
         o = u('≤');
      }else if (c === u('⇒')){  //代入対応
         o = u('→');
      }else{
         o = c;
      }
      if (o !== null){
         r[r.length] = o;
      }
   }
   return r;
};

//演算子統一
// >=を≥に、 <=を≤に、 !=を≠に、->を→に変換する
Sunaba.Compiler.unifyOperator = function(code){
   var r = [];
   var i;
   var mode = 0;
   var l = code.length;
   var u = function(string){ //1文字目のunicodeを返す関数を短く定義
      return string.charCodeAt();
   };
   for (i = 0; i < l; i += 1){
      var c = code[i];
      if (mode === 0){ //初期
         if (c === u('>')){
            mode = 1;
         }else if (c === u('<')){
            mode = 2;
         }else if (c === u('!')){
            mode = 3;
         }else if (c === u('-')){
            mode = 4;
         }else{
            r[r.length] = c;
         }
      }else if (mode === 1){ //>
         if (c === u('=')){ //>=成立
            r[r.length] = u('≥');
         }else{
            r[r.length] = u('>');
         }
         mode = 0;
      }else if (mode === 2){ //<
         if (c === u('=')){ //<=成立
            r[r.length] = u('≤');
         }else{
            r[r.length] = u('<');
         }
         mode = 0;
      }else if (mode === 3){ //!
         if (c === u('=')){ //!=成立
            r[r.length] = u('≠');
         }else{
            r[r.length] = u('!');
         }
         mode = 0;
      }else if (mode === 4){ //-
         if (c === u('>')){ //->成立
            r[r.length] = u('→');
         }else{
            r[r.length] = u('-');
         }
         mode = 0;
      }else{
         throw 'BUG';
      }
   }
   return r;
};

//#の後ろを行末まで削る。文字列リテラルはないので、例外処理はない
Sunaba.Compiler.removeSingleLineComment = function(code){
   var r = [];
   var i;
   var l = code.length;
   var inComment = false;
   var LF = '\n'.charCodeAt();
   var SHARP = '#'.charCodeAt();
   for (i = 0; i < l; i += 1){
      if (inComment){
         if (code[i] === LF){
            r[r.length] = LF;
            inComment = false;
         }
      }else{
         if (code[i] === SHARP){
            inComment = true;
         }else{
            r[r.length] = code[i];
         }
      }
   }
   return r;
};

// /* ... */ を削る。Cと違ってネストを正しく判定する
/*
0 初期
1 /
2 /* コメント中
3 /* ... *
*/
Sunaba.Compiler.removeMultiLineComment = function(code){
   var r = [];
   var i;
   var l = code.length;
   var mode = 0;
   var SLASH = '/'.charCodeAt();
   var ASTERISK = '*'.charCodeAt();
   for (i = 0; i < l; i += 1){
      var c = code[i];
      if (mode === 0){
         if (c === SLASH){
            mode = 1;
         }else{
            r[r.length] = c;
         }
      }else if (mode === 1){
         if (c === ASTERISK){ //コメント成立
            mode = 2;
         }else{
            r[r.length] = SLASH; //さっきのスラッシュを出力
            r[r.length] = c; //今回の文字を出力
            mode = 0;
         }
      }else if (mode === 2){ //コメント中
         if (c === ASTERISK){ //コメント終了?
            mode = 3;
         }
      }else if (mode === 3){ //コメント終了?
         if (c === SLASH){ //終了！
            mode = 0;
         }
      }else{
         throw 'BUG';
      }
   }
   return r;
};

//トークン分解
/*
[モード]
0 行頭
1 行頭以外1文字目
2 文字列
*/
Sunaba.Compiler.tokenize = function(code, loc){
   var tokens = [];
   var msg = null;
   var end = code.length;
   var mode = 0;
   var begin = 0;
   var line = 1;
   var u = function(string){ //1文字目のunicodeを返す関数を短く定義
      return string.charCodeAt();
   };
   var i = 0;
   while (i < end){
      var advance = true;
      var c = code[i];
      var l = i - begin; //現時点でのトークン長
      if (mode === 0){
         if (c === u(' ')){ //空白が続く限り留まる
            ;
         }else if (c === u('\n')){ //空白しかないまま行を終えたので無視
            begin = i + 1; //開始
            line += 1;
         }else{ //行頭を出力
            tokens[tokens.length] = {type:'LINE_BEGIN', line:line, number:l}; //numberに空白数を入れる
            mode = 1;
            advance = false; //この文字もう一度
         }
      }else if (mode === 1){ //行頭以外のトークン先頭
         if (c === u('(')){
            tokens[tokens.length] = {type:'(', string:'(', line:line};
         }else if (c === u(')')){
            tokens[tokens.length] = {type:')', string:')', line:line};
         }else if (c === u('[')){
            tokens[tokens.length] = {type:'[', string:'[', line:line};
         }else if (c === u(']')){
            tokens[tokens.length] = {type:']', string:']', line:line};
         }else if (c === u(',')){
            tokens[tokens.length] = {type:',', string:',', line:line};
         }else if (c === u('→')){
            tokens[tokens.length] = {type:'→', string:'→', line:line};
         }else if (c === u('+')){
            tokens[tokens.length] = {type:'OPERATOR', operator:'+', string:'+', line:line};
         }else if (c === u('-')){
            tokens[tokens.length] = {type:'OPERATOR', operator:'-', string:'-', line:line};
         }else if (c === u('*')){
            tokens[tokens.length] = {type:'OPERATOR', operator:'*', string:'*', line:line};
         }else if (c === u('/')){
            tokens[tokens.length] = {type:'OPERATOR', operator:'/', string:'/', line:line};
         }else if (c === u('=')){
            tokens[tokens.length] = {type:'OPERATOR', operator:'=', string:'=', line:line};
         }else if (c === u('≠')){
            tokens[tokens.length] = {type:'OPERATOR', operator:'≠', string:'≠', line:line};
         }else if (c === u('<')){
            tokens[tokens.length] = {type:'OPERATOR', operator:'<', string:'<', line:line};
         }else if (c === u('>')){
            tokens[tokens.length] = {type:'OPERATOR', operator:'>', string:'>', line:line};
         }else if (c === u('≤')){
            tokens[tokens.length] = {type:'OPERATOR', operator:'≤', string:'≥', line:line};
         }else if (c === u('≥')){
            tokens[tokens.length] = {type:'OPERATOR', operator:'≥', string:'≤', line:line};
         }else if (c === u('\n')){ //行末
            mode = 0;
            begin = i + 1;
            line += 1;
         }else if (c ===u(' ')){ //空白が来た
            ; //何もしない
         }else if (Sunaba.isInName(c)){ //識別子開始
            mode = 2;
            begin = i;
         }else{
            msg = '行' + line + ': Sunabaで使うはずのない文字"' + String.fromCharCode(c) + '"が出てきた。';
            if (c === ';'.charCodeAt()){
               msg += 'C言語と違って文末の;は不要。';
            }else if ((c === '{') || (c === '}')){
               msg += 'C言語と違って{や}は使わない。行頭の空白で構造を示す。';
            }
            break;
         }
      }else if (mode === 2){ //識別子
         if (Sunaba.isInName(c)){ //続く
            ;
         }else{ //その他の場合、出力
            var str = HLib.convertUtf32ArrayToString(code, begin, l);
            var keyword = Sunaba.readKeyword(str, loc); //キーワード
            if (keyword !== null){
               tokens[tokens.length] = {type:keyword, string:str, line:line};
            }else{
               var number = Sunaba.readNumber(code, begin, l);
               if (number !== null){
                  if (Math.abs(number) > Sunaba.MAX_ABS_NUMBER){
                     msg = '行' + line + ': Sunabaでは扱えない大きな数' + number + 'が現れました。';
                     msg = 'プラスマイナス' + Sunaba.MAX_ABS_NUMBER + 'の範囲しか使えません。';
                     break;
                  }else{
                     tokens[tokens.length] = {type:'NUMBER', number:number, string:str, line:line};
                  }
               }else{ //キーワードでも数字でもないので名前
                  tokens[tokens.length] = {type:'NAME', string:str, line:line};
               }
            }
            mode = 1;
            advance = false; //もう一回この文字から回す
         }
      }else{
         throw 'BUG';
      }
      if (advance){
         i += 1;
      }
   }
   //ダミー最終トークン
   tokens[tokens.length] = {type:'END', string:str, line:line};
   return {tokens:tokens, errorMessage:msg};
};

Sunaba.Compiler.structurize = function(tokens){
   var r = [];
   var spaceCountStack = [0];
   var spaceCountStackPos = 1;
   var parenLevel = 0;
   var braceLevel = 0;
   var n = tokens.length;
   var i;
   var msg = null;
   var prevT = null;
   var emptyLine = true; //最初は空
   for (i = 0; i < n; i += 1){
      var t = tokens[i];
      if (t.type === '('){
         parenLevel += 1;
      }else if (t.type === ')'){
         parenLevel -= 1;
         if (parenLevel < 0){
            msg = '行' + t.line + ': )が(より多い。';
            break;
         }
      }else if (t.type === '['){
         braceLevel += 1;
      }else if (t.type === ']'){
         braceLevel -= 1;
         if (braceLevel < 0){
            msg = '行' + t.line + ': ]が[より多い。';
            break;
         }
      }
      if (t.type === 'LINE_BEGIN'){ //行頭
         var prevIsOp = false; //前のトークンは演算子か代入か？
         if ((prevT !== null) && ((prevT.type === 'OPERATOR') || (prevT.type === '→'))){
            prevIsOp = true;
         }
         //()や[]の中におらず、前のトークンが演算子や代入記号でなければ、
         if ((parenLevel === 0) && (braceLevel === 0) && (!prevIsOp)){
            var newCount = t.number;
            var oldCount = spaceCountStack[spaceCountStackPos - 1];
            if (newCount > oldCount){ //増えた
               spaceCountStack[spaceCountStackPos] = newCount;
               spaceCountStackPos += 1;
               r[r.length] = {type:'{', string:'{', line:t.line};
            }else if (newCount === oldCount){
               if (!emptyLine){ //空行でなければ
                  r[r.length] = {type:';', string:';', line:t.line};
                  emptyLine = true;
               }
            }else{ //newCount < oldCount
               if (!emptyLine){ //空行でなければ
                  r[r.length] = {type:';', string:';', line:t.line};
                  emptyLine = true;
               }
               while (newCount < oldCount){ //ずれてる間回す
                  spaceCountStackPos -= 1;
                  if (spaceCountStackPos < 1){ //ありえない
                     throw 'BUG';
                  }
                  oldCount = spaceCountStack[spaceCountStackPos - 1];
                  r[r.length] = {type:'}', string:'}', line:t.line};
               }
               if (newCount != oldCount){ //ずれている
                  msg = '行' + t.line + ': 字下げが不正。ずれてるよ。前の深さに合わせてね。';
                  break;
               }
            }
         }
      }else{
         r[r.length] = t; //そのまま移植
         emptyLine = false; //空行ではなくなった
      }
      prevT = t;
   }
   if (!emptyLine){ //最後の行を終わらせる
      r[r.length] = {type:';', string:';', line:prevT.line};
   }
   //ブロック終了を補う
   while (spaceCountStackPos > 1){
      spaceCountStackPos -= 1;
      r[r.length] = {type:'}', string:'}', line:prevT.line};
   }
   return {errorMessage:msg, tokens:r};
};

Sunaba.compile = function(codeString, localeName){
   var locale = Sunaba.locales[localeName];
   //UTF32化
   var debugStr;
   var code = HLib.convertStringToUtf32Array(codeString);
   debugStr = HLib.convertUtf32ArrayToString(code); //デバガで見るための行
   //タブ/全角スペースを処理
   code = Sunaba.Compiler.unifySpace(code);
   debugStr = HLib.convertUtf32ArrayToString(code); //デバガで見るための行
   //改行コードを統一
   code = Sunaba.Compiler.unifyNewLine(code);
   debugStr = HLib.convertUtf32ArrayToString(code); //デバガで見るための行
   //文字置換
   code = Sunaba.Compiler.replaceChar(code, locale);
   debugStr = HLib.convertUtf32ArrayToString(code); //デバガで見るための行
   //演算子置換(2文字以上から成る演算子を1文字に置換
   code = Sunaba.Compiler.unifyOperator(code);
   debugStr = HLib.convertUtf32ArrayToString(code); //デバガで見るための行
   //一行コメント削除
   code = Sunaba.Compiler.removeSingleLineComment(code);
   debugStr = HLib.convertUtf32ArrayToString(code); //デバガで見るための行
   //複数行コメント削除
   code = Sunaba.Compiler.removeMultiLineComment(code);
   debugStr = HLib.convertUtf32ArrayToString(code); //デバガで見るための行
   //トークン分解 includeを一旦外すので、ファイル名不要
   var result = Sunaba.Compiler.tokenize(code, locale);
   if (result.errorMessage !== null){
      return {errorMessage:result.errorMessage, compiled:null};
   }
   //ブロック構造解析
   result = Sunaba.Compiler.structurize(result.tokens);
   if (result.errorMessage !== null){
      return {errorMessage:result.errorMessage, compiled:null};
   }
   //構文解析
   var parser = new Sunaba.Parser(result.tokens, locale);
   var root = parser.parseProgram();
   if (root === null){
      return {errorMessage:parser.errorMessage, compiled:null};
   }
   //TODO: コード生成
   //TODO: アッセンブル (マシン語バイナリにはしない。decodeされた命令の状態で格納)
   return {errorMessage:null, instructions:null};
};

Sunaba.assemble = function(codeString){
   //UTF32化
   var debugStr;
   var code = HLib.convertStringToUtf32Array(codeString);
   debugStr = HLib.convertUtf32ArrayToString(code); //デバガで見るための行
   //タブ/全角スペースを処理
   code = Sunaba.Compiler.unifySpace(code);
   debugStr = HLib.convertUtf32ArrayToString(code); //デバガで見るための行
   //改行コードを統一
   code = Sunaba.Compiler.unifyNewLine(code);
   debugStr = HLib.convertUtf32ArrayToString(code); //デバガで見るための行
   //一行コメント削除
   code = Sunaba.Compiler.removeSingleLineComment(code);
   debugStr = HLib.convertUtf32ArrayToString(code); //デバガで見るための行
   //複数行コメント削除
   code = Sunaba.Compiler.removeMultiLineComment(code);
   debugStr = HLib.convertUtf32ArrayToString(code); //デバガで見るための行

   var assembler = new Sunaba.Assembler();
   if (assembler.errorMessage !== null){
      return {errorMessage:result.errorMessage, instructions:null};
   }
   //トークン化
   assembler.tokenize(code);
   if (assembler.errorMessage !== null){
      return {errorMessage:assembler.errorMessage, instructions:null};
   }
   //命令生成
   assembler.parse();
   if (assembler.errorMessage !== null){
      return {errorMessage:assembler.errorMessage, instructions:null};
   }
   //ラベル解決
   assembler.resolveLabelAddress();
   if (assembler.errorMessage !== null){
      return {errorMessage:assembler.errorMessage, instructions:null};
   }
   //完成!
   return {
      errorMessage:assembler.errorMessage,
      instructions:assembler.instructions};
};

//Assembler
Sunaba.Assembler = function(){
   this.instructions = [];
   this.errorMessage = null;

   this.mTokens = [];
   this.mPos = 0;
   this.mLabels = {};
};

/*
モード
0 : 空白の上
1 : 文字列の上

0,\n,0 改行を出力
0,*,1 文字列開始
0,:,0 ラベル終了記号出力
*/
Sunaba.Assembler.prototype.tokenize = function(code){
   var u = function(string){
      return string.charCodeAt();
   };
   code[code.length] = u('\n'); //番兵として終端改行追加。これで簡単になる。
   var tokens = this.mTokens;
   var end = code.length;
   var mode = 0;
   var begin = 0;
   var line = 1;
   var i = 0;
   while (i < end){
      var c = code[i];
      var l = i - begin;
      if (mode === 0){
         if (c === u('\n')){ //改行
            tokens[tokens.length] = {type:'\n', line:line, string:'\n'};
            line += 1;
         }else if (c === u(' ')){ //空白(タブ、全角は変換済み)
            ; //何もしない
         }else if (c === u(':')){ //ラベル終わり
            tokens[tokens.length] = {type:':', line:line, string:':'};
         }else{
            mode = 1;
            begin = i;
         }
      }else if (mode === 1){
         if ((c === u('\n')) || (c === u(' ')) || (c === u(':'))){
            //文字列出力
            var str = HLib.convertUtf32ArrayToString(code, begin, l);
            var num = Sunaba.readNumber(code, begin, l);
            if (num !== null){
               tokens[tokens.length] = {type:'NUMBER', line:line, number:num, string:str};
            }else{
               //命令名かを判定
               var inst = Sunaba.readInstruction(str);
               if (inst !== null){
                  tokens[tokens.length] = {type:'INSTRUCTION', line:line, string:str};
               }else{
                  tokens[tokens.length] = {type:'NAME', line:line, string:str};
               }
            }
            //記号出力
            if (c === u('\n')){ //改行
               tokens[tokens.length] = {type:'\n', line:line, string:'\n'};
               line += 1;
            }else if (c === u(':')){ //ラベル終端
               tokens[tokens.length] = {type:':', line:line, string:':'};
            } //else{ 何もしない
            mode = 0;
         }
      }else{
         throw 'BUG';
      }
      i += 1;
   }
   HLib.assert(mode === 0); //mode1のまま抜けることはない
   //終了トークン追加
   tokens[tokens.length] = {type:'END', line:line, string:'END'};
};

Sunaba.Assembler.prototype.parse = function(){
   var tokens = this.mTokens;
   while (tokens[this.mPos].type !== 'END'){
      var t = tokens[this.mPos];
      if (t.type === 'NAME'){ //ラベル発見
         if (this.parseLabel() === false){
            return;
         }
      }else if (t.type === 'INSTRUCTION'){ //命令発見
         if (this.parseInstruction() === false){
            return;
         }
      }else if (t.type === '\n'){ ///改行は無視
         this.mPos += 1;
      }else{
         this.errorMessage = '行' + t.line + ': 文頭にラベルでも命令でもないもの「' + t.string + '」がある。';
         return;
      }
   }
};

Sunaba.Assembler.prototype.parseLabel = function(){
   var tokens = this.mTokens;
   var t = tokens[this.mPos];
   HLib.assert(t.type === 'NAME');
   //マップに放り込む。すでにあればエラー
   var labelName = t.string;
   var label = this.mLabels[labelName];
   if (label){
      this.errorMessage = '行' + t.line + ': ラベル「' + labelName + '」は前にもう出てきた。';
      return;
   }else{
      this.mLabels[labelName] = this.instructions.length; //現命令数を入れる
   }
   this.mPos += 1;
   //:
   t = tokens[this.mPos];
   if (t.type !== ':'){
      this.errorMessage = '行' + t.line + ': ラベル「' + labelName + '」の後に:がない。それとも命令をスペルミスした？';
      return;
   }
   this.mPos += 1;
};

Sunaba.Assembler.prototype.parseInstruction = function(){
   var tokens = this.mTokens;
   var t = tokens[this.mPos];
   HLib.assert(t.type === 'INSTRUCTION');
   this.mPos += 1;
   var name = t.string;
   var inst = {name:name, line:t.line, imm:-0x7fffffff, label:''};
   if ( //ラベルオペランド
   (name === 'j') ||
   (name === 'bz') ||
   (name === 'call')){
      var op = tokens[this.mPos];
      this.mPos += 1;
      if (op.type !== 'NAME'){
         this.errorMessage = '行' + t.line + ': 命令「' + name + '」は入力値としてラベル名を取るが、「' + op.string + '」がある。';
         return;
      }
      inst.label = op.string;
   }else if ( //数値オペランド
   (name === 'ld') ||
   (name === 'fld') ||
   (name === 'st') ||
   (name === 'fst') ||
   (name === 'i') ||
   (name === 'pop') ||
   (name === 'ret')){
      var op = tokens[this.mPos];
      this.mPos += 1;
      if (op.type !== 'NUMBER'){
         this.errorMessage = '行' + t.line + ': 命令「' + name + '」は入力値として数値を取るが、「' + op.string + '」がある。';
         return;
      }
      inst.imm = op.number;
   }
   this.instructions[this.instructions.length] = inst;
   //改行があるはず
   var t = tokens[this.mPos];
   if (t.type !== '\n'){
      this.errorMessage = '行' + t.line + ': 命令「' + name + '」の後に余計なものがある。改行を忘れたか？';
      return;
   }
   this.mPos += 1;
};

Sunaba.Assembler.prototype.resolveLabelAddress = function(){
   //命令をなめて、ラベル名をアドレスに変換する
   var n = this.instructions.length;
   for (var i = 0; i < n; i += 1){
      var t = this.instructions[i];
      if ((t.name === 'j') || (t.name === 'bz') || (t.name === 'call')){
         var label = t.label;
         var address = this.mLabels[label];
         if ((typeof address) === 'undefined'){ //ない！
            this.errorMessage = '行' + t.line + ': ラベル「' + label + '」は定義されていない！';
            return;
         }
         t.imm = address;
      }
   }
};

//Sunaba.Machine
Sunaba.Machine = function(instructions){
   this.screenWidth = 100;
   this.screenHeight = 100;
   this.message = '';
   this.error = false;
   this.waitDisplay = false;

   var M = Sunaba.Machine;
   var Mm = M.Memory;
   this.mInstructions = instructions; //TODO: 本来ならマシンコードをメモリに入れるはずだが、そんな周りくどいことは今はしない。
   var instCount = instructions.length;
   var vramSize = this.screenWidth * this.screenHeight;
   this.mMemory = new Int32Array(Mm.VRAM_BASE + vramSize);
   this.mProgramBegin = M.FREE_AND_PROGRAM_SIZE - instCount;
   this.mProgramCounter = this.mProgramBegin;
   this.mStackPointer = Mm.STACK_BASE;
   this.mFramePointer = Mm.STACK_BASE;
   this.mMemory[Mm.FREE_REGION_END] = this.mProgramBegin;
   this.mMemory[Mm.GET_SCREEN_WIDTH] = this.mMemory[Mm.SET_SCREEN_WIDTH] = this.screenWidth;
   this.mMemory[Mm.GET_SCREEN_HEIGHT] = this.mMemory[Mm.SET_SCREEN_HEIGHT] = this.screenHeight;
   this.mMemory[Mm.SCREEN_BEGIN] = Mm.VRAM_BASE;
   for (var i = 0; i < 3; i += 3){
      this.mMemory[Mm.SET_SOUND_DUMPING0 + i] = 1000;
      this.mMemory[Mm.SET_SOUND_FREQUENCY0 + i] = 20;
   }
};

//定数類。短縮のために関数化
(function(){
   var M = Sunaba.Machine;
   M.FREE_AND_PROGRAM_SIZE = 40000;
   M.STACK_SIZE = 10000;
   M.IO_MEMORY_SIZE = 10000;
   M.IO_WRITABLE_OFFSET = 5000;
   M.EXECUTION_UNIT = 10000;
   //自動計算定数類
   M.Memory = {};
   var Mm = M.Memory;
   Mm.STACK_BASE = M.FREE_AND_PROGRAM_SIZE;
   Mm.STACK_END = Mm.STACK_BASE + M.STACK_SIZE;
   Mm.IO_BASE = Mm.STACK_END;
   Mm.IO_END = Mm.IO_BASE + M.IO_MEMORY_SIZE;
   Mm.VRAM_BASE = Mm.IO_END;
   Mm.IO_READABLE_BEGIN = Mm.IO_BASE;
   Mm.IO_WRITABLE_BEGIN = Mm.IO_BASE + M.IO_WRITABLE_OFFSET;
   //READアドレス
   var ioReadTable = [
      'POINTER_X',
      'POINTER_Y',
      'BUTTON_LEFT',
      'BUTTON_RIGHT',
      'KEY_UP',
      'KEY_DOWN',
      'KEY_LEFT',
      'KEY_RIGHT',
      'KEY_SPACE',
      'KEY_ENTER',
      'FREE_REGION_END',
      'GET_SCREEN_WIDTH',
      'GET_SCREEN_HEIGHT',
      'SCREEN_BEGIN',
      'IO_READABLE_END' ];
   var i;
   for (i = 0; i < ioReadTable.length; i += 1){
      Mm[ioReadTable[i]] = Mm.IO_READABLE_BEGIN + i;
   };
   //WRITEアドレス
   var ioWriteTable = [
      'SYNC',
      'DISABLE_AUTO_SYNC',
      'DRAW_CHAR',
      'BREAK',
      'SET_SCREEN_WIDTH',
      'SET_SCREEN_HEIGHT',
      'SET_SOUND_FREQUENCY0',
      'SET_SOUND_FREQUENCY1',
      'SET_SOUND_FREQUENCY2',
      'SET_SOUND_DUMPING0',
      'SET_SOUND_DUMPING1',
      'SET_SOUND_DUMPING2',
      'SET_SOUND_AMPLITUDE0',
      'SET_SOUND_AMPLITUDE1',
      'SET_SOUND_AMPLITUDE2',
      'IO_WRITABLE_END' ];
   var i;
   for (i = 0; i < ioWriteTable.length; i += 1){
      Mm[ioWriteTable[i]] = Mm.IO_WRITABLE_BEGIN + i;
   };
}());

Sunaba.Machine.prototype.vram = function(){
   var begin = Sunaba.Machine.Memory.VRAM_BASE;
   var end = begin + (this.screenWidth * this.screenHeight);
   return this.mMemory.slice(begin, end);
};

Sunaba.Machine.prototype.isRunning = function(){
   if (this.error){
      return false;
   }
   if (this.mProgramCounter >= Sunaba.Machine.FREE_AND_PROGRAM_SIZE){
      return false;
   }
   return true;
};

Sunaba.Machine.prototype.update = function(input){
   //入力反映
   var M = Sunaba.Machine;
   var Mm = M.Memory;
   this.mMemory[Mm.POINTER_X] = input.x;
   this.mMemory[Mm.POINTER_Y] = input.y;
   this.mMemory[Mm.BUTTON_LEFT] = input.buttonLeft;
   this.mMemory[Mm.BUTTON_RIGHT] = input.buttonRight;
   this.mMemory[Mm.KEY_UP] = input.up;
   this.mMemory[Mm.KEY_DOWN] = input.down;
   this.mMemory[Mm.KEY_LEFT] = input.left;
   this.mMemory[Mm.KEY_RIGHT] = input.right;
   this.mMemory[Mm.KEY_SPACE] = input.space;
   this.mMemory[Mm.KEY_ENTER] = input.enter;
   var n = Sunaba.Machine.EXECUTION_UNIT;
   for (var i = 0; i < n; i += 1){
      if (this.waitDisplay){ //画面描画待ち
         break;
      }
      if (this.error){
         break;
      }
      if (this.mProgramCounter === M.FREE_AND_PROGRAM_SIZE){
         HLib.assert(this.mStackPointer === Mm.STACK_BASE);
         HLib.assert(this.mFramePointer === Mm.STACK_BASE);
         this.message += 'プログラムが正しく終了した。';
         break;
      }
      this.executeInstruction();
   }
};

Sunaba.Machine.prototype.push = function(a){
   var Mm = Sunaba.Machine.Memory;
   if (this.mStackPointer >= Mm.STACK_END){
      this.error = true;
      this.message = 'スタックあふれ。名前付きメモリを使いすぎてメモリが尽きた。';
   }else{
      this.mMemory[this.mStackPointer] = a;
      this.mStackPointer += 1;
   }
};

Sunaba.Machine.prototype.pop = function(n){
   var Mm = Sunaba.Machine.Memory;
   if (this.mStackPointer <= Mm.STACK_BASE){
      this.error = true;
      this.message = 'pop過剰によりスタックを下にはみ出した。';
      return null;
   }else{
      this.mStackPointer -= 1;
      return this.mMemory[this.mStackPointer];
   }
};

//スタックポインタをn下げる
Sunaba.Machine.prototype.popN = function(n){
   var Mm = Sunaba.Machine.Memory;
   if ((this.mStackPointer - n) < Mm.STACK_BASE){
      this.error = true;
      this.message = 'pop過剰によりスタックを下にはみ出した。';
   }else if ((this.mStackPointer - n) >= Mm.STACK_END){
      this.error = true;
      this.message = 'スタックあふれ。名前付きメモリを使いすぎてメモリが尽きた。';
   }else{
      this.mStackPointer -= n;
   }
};

Sunaba.Machine.prototype.executeInstruction = function(){
   var Mm = Sunaba.Machine.Memory;
   var inst = this.mInstructions[this.mProgramCounter - this.mProgramBegin];
   var name = inst.name;
   var imm = inst.imm;
   var op0, op1;
   if (name === 'i'){
      this.push(imm);
   }else if (name === 'add'){
      op1 = this.pop();
      op0 = this.pop();
      this.push(op0 + op1);
   }else if (name === 'sub'){
      op1 = this.pop();
      op0 = this.pop();
      this.push(op0 - op1);
   }else if (name === 'mul'){
      op1 = this.pop();
      op0 = this.pop();
      this.push(op0 * op1);
   }else if (name === 'div'){
      op1 = this.pop();
      if (op1 === 0){
         this.error = true;
         this.message = '行' + inst.line + ': 0では割れない。';
      }else{
         op0 = this.pop();
         this.push(op0 / op1);
      }
   }else if (name === 'lt'){
      op1 = this.pop();
      op0 = this.pop();
      this.push((op0 < op1) ? 1 : 0);
   }else if (name === 'le'){
      op1 = this.pop();
      op0 = this.pop();
      this.push((op0 <= op1) ? 1 : 0);
   }else if (name === 'eq'){
      op1 = this.pop();
      op0 = this.pop();
      this.push((op0 === op1) ? 1 : 0);
   }else if (name === 'ne'){
      op1 = this.pop();
      op0 = this.pop();
      this.push((op0 !== op1) ? 1 : 0);
   }else if ((name === 'ld') || (name === 'fld')){
      if (name === 'ld'){
         op0 = this.pop();
      }else{
         op0 = this.mFramePointer;
      }
      op0 += imm;
      if (op0 < 0){
         this.error = true;
         this.message = '行' + inst.line + ': マイナスの番号のメモリはない(番号:' << op0 << ')';
      }else if (op0 < this.mProgramBegin){ //正常実行
         this.push(this.mMemory[op0]);
      }else if (op0 < Mm.STACK_BASE){ //プログラム域
         this.error = true;
         this.message = '行' + inst.line + ': プログラムが入っているメモリを見ようとした(番号:' << op0 << ')';
      }else if (op0 < Mm.IO_BASE){ //スタック域。正常実行
         this.push(this.mMemory[op0]);
      }else if (op0 < Mm.IO_READABLE_END){ //入力メモリ域。正常実行。原版ではここで入力取得を行っていた
         this.push(this.mMemory[op0]);
      }else if (op0 < Mm.IO_WRITABLE_BEGIN){ //入力メモリ域。正常実行。原版ではここで入力取得を行っていた
         this.error = true;
         this.message = '行' + inst.line + ': このあたりのメモリは使えない(番号:' << op0 << ')';
      }else if (op0 < Mm.VRAM_BASE){ //出力メモリ域。
         this.error = true;
         this.message = '行' + inst.line + ': このあたりのメモリは見えない(番号:' << op0 << ')';
      }else if (op0 < (Mm.VRAM_BASE + (this.screenWidth * this.screenHeight))){ //画面メモリ
         this.error = true;
         this.message = '行' + inst.line + ': 画面メモリは見えない(番号:' << op0 << ')';
      }else{
         this.error = true;
         this.message = '行' + inst.line + ': メモリ範囲外を見ようとした(番号:' << op0 << ')';
      }
   }else if ((name === 'st') || (name === 'fst')){
      op1 = this.pop();
      if (name === 'st'){
         op0 = this.pop();
      }else{
         op0 = this.mFramePointer;
      }
      op0 += imm;
      if (op0 < 0){
         this.error = true;
         this.message = '行' + inst.line + ': マイナスの番号のメモリはない(番号:' << op0 << ')';
      }else if (op0 < this.mProgramBegin){ //正常実行
         this.mMemory[op0] = op1;
      }else if (op0 < Mm.STACK_BASE){ //プログラム領域
         this.error = true;
         this.message = '行' + inst.line + ': プログラムが入っているメモリにセットしようとした(番号:' << op0 << ')';
      }else if (op0 < Mm.IO_BASE){ //スタック領域。正常実行。
         this.mMemory[op0] = op1;
      }else if (op0 < Mm.IO_WRITABLE_BEGIN){ //読み込み域
         this.error = true;
         this.message = '行' + inst.line + ': このあたりのメモリはセットはできない(番号:' << op0 << ')';
      }else if (op0 === Mm.SYNC){
         this.waitDisplay = true;
      }else if (op0 === Mm.DISABLE_AUTO_SYNC){
         this.mMemory[op0] = op1; //単に入れておくだけ。
      }else if (op0 === Mm.DRAW_CHAR){
         this.message += String.fromCharCode(op1);
      }else if (op0 === Mm.BREAK){
         ; //未対応
      }else if (op0 === Mm.SET_SCREEN_WIDTH){
         ; //未対応
      }else if (op0 === Mm.SET_SCREEN_HEIGHT){
         ; //未対応
      }else if (op0 === Mm.SET_SCREEN_HEIGHT){
         ; //未対応
      }else if ((op0 >= Mm.SET_SOUND_FREQUENCY0) && (op0 <= Mm.SET_SOUND_AMPLITUDE2)){
         ; //未対応
         this.mMemory[op0] = op1; //単に入れておくだけ。
      }else if(op0 < Mm.VRAM_BASE){
         this.error = true;
         this.message = '行' + inst.line + ': このあたりのメモリは使えない(番号:' << op0 << ')';
      }else if (op0 < (Mm.VRAM_BASE + (this.screenWidth * this.screenHeight))){ //画面メモリ
         this.mMemory[op0] = op1; //単に入れておくだけ。
         if (this.mMemory[Mm.DISABLE_AUTO_SYNC] === 0){
            this.waitDisplay = true;
         }
      }else{
         this.error = true;
         this.message = '行' + inst.line + ': メモリ範囲外にセットしようとした(番号:' << op0 << ')';
      }
   }else if (name === 'j'){
      this.mProgramCounter = imm - 1 + this.mProgramBegin;
   }else if (name === 'bz'){
      op0 = this.pop();
      if (op0 === 0){
         this.mProgramCounter = imm - 1 + this.mProgramBegin;
      }
   }else if (name === 'call'){
      this.push(this.mFramePointer);
      this.push(this.mProgramCounter);
      this.mFramePointer = this.mStackPointer;
      this.mProgramCounter = imm - 1 + this.mProgramBegin;
      if ((this.mProgramCounter < this.mProgramBegin) || ((this.mProgramCounter + 1) >= Mm.STACK_BASE)){
         this.error = true;
         this.message = '行' + inst.line + ': call後のプログラムカウンタが範囲外。アセンブラにバグがある？(番号:' << this.mProgramCounter << ')';
      }
   }else if (name === 'ret'){
      this.popN(imm);
      this.mProgramCounter = this.pop();
      this.mFramePointer = this.pop();
      if ((this.mProgramCounter < this.mProgramBegin) || ((this.mProgramCounter + 1) >= Mm.STACK_BASE)){
         this.error = true;
         this.message = '行' + inst.line + ': ret後のプログラムカウンタが範囲外。スタックを破壊した？(番号:' << this.mProgramCounter << ')';
      }
      if ((this.mFramePointer < Mm.STACK_BASE) || (this.mFramePointer >= Mm.STACK_END)){
         this.error = true;
         this.message = '行' + inst.line + ': ret後のフレームポインタが範囲外。スタックを破壊した？(番号:' << this.mFramePointer << ')';
      }
   }else if (name === 'pop'){
      this.popN(imm);
   }
   this.mProgramCounter += 1;
};

//Main
(function main(){
   var machine = null; //closure
   var localeName = 'japanese'; //closure
   var gpu = new HLib.Gpu({canvas:'screen', uEnd:(100/128), vEnd:(100/128)});
   var texture = new HLib.Texture({pointSampling:true, gpu:gpu, width:128, height:128}); //closure
   var frameBufferData = new Uint8Array(128 * 128 * 4);
   var shader = new HLib.Shader({gpu:gpu, vertexShaderId:'vs', fragmentShaderId:'fs'});
   gpu.setTexture(texture);
   gpu.setShader(shader);

   var input = {
      x:0,
      y:0,
      buttonLeft:0,
      buttonRight:0,
      up:0,
      down:0,
      left:0,
      right:0,
      space:0,
      enter:0 }; //closure
   input.reset = function(){
      this.x = this.y = null;
      this.buttonLeft = this.buttonRight = 0;
      this.up = this.down = this.left = this.right = this.space = this.enter = 0;
   };

   var display = function(){
      //起動していないか、エラーなら先へ
      if ((machine === null) || machine.error || (machine.waitDisplay === false)){
         requestAnimationFrame(display); //次回へ
         return;
      }
      var w = machine.screenWidth;
      var h = machine.screenHeight;
      var vram = machine.vram();
      //まず配列に移す
      var dLine = 0;
      var sLine = 0;
      for (var y = 0; y < 100; y += 1){
         var d = dLine;
         var s = sLine;
         for (var x = 0; x < 100; x += 1){
            var v = vram[s];
            frameBufferData[d + 0] = (v >>> 0) & 0xff; //bit0-7
            frameBufferData[d + 1] = (v >>> 8) & 0xff; //bit8-15
            frameBufferData[d + 2] = (v >>> 16) & 0xff; //bit16-23
            frameBufferData[d + 3] = 0xff; //bit24-31
            d += 4;
            s += 1;
         }
         dLine += 128 * 4;
         sLine += 100;
      }
      texture.update(frameBufferData);
      gpu.draw();
      machine.waitDisplay = false; //表示終了
      requestAnimationFrame(display); //次回へ
   };
   var updateMachine = function(){
      if (machine.isRunning()){
         machine.update(input);
         setTimeout(updateMachine, 0);
      }else{
         document.getElementById('message').insertAdjacentHTML('beforeend', machine.message);
         machine = null; //終了
      }
   };
   var onDragOver = function(e){
      e.stopPropagation();
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
   };
   var bootMachine = function(code){
      var asm = document.getElementById('useAssembler').checked;
      var result = null;
      if (asm === false){ //アセンブラが吐かれる
         code = Sunaba.compile(code, localeName);
      }
      result = Sunaba.assemble(code);
      //正しくコンパイルできたらマシンを再起動
      if (result.errorMessage !== null){
         document.getElementById('message').insertAdjacentHTML('beforeend', result.errorMessage);
      }else{
         machine = new Sunaba.Machine(result.instructions); //これで再起動
      }
      setTimeout(updateMachine, 0);
   };
   var loadCallback = function(text){
      var textarea = document.getElementById('code');
      textarea.value = text;
      bootMachine(text);
   };
   var onDrop = function(e){
      e.stopPropagation();
      e.preventDefault();
      var dt = e.dataTransfer;
      var urlOrBlob;
      if (dt.files.length > 0){
         urlOrBlob = dt.files[0];
      }else{
         urlOrBlob = dt.getData('text/plain');
         if (/^http:\/\//.test(urlOrBlob) === false){
            urlOrBlob = 'http://' + urlOrBlob;
         }
      }
      HLib.loadFileAsText(urlOrBlob, loadCallback);
   };
   var onKeyDownForCodeArea = function(e){
      if (e.keyCode === 9){ //タブを打てるようにする
         var tArea = e.target;
         var str = tArea.value;
         var pos = tArea.selectionStart;
         var s0 = str.substr(0, pos);
         var s1 = str.substr(pos, str.length);
         var newStr = s0 + '\t' + s1;
         tArea.value = newStr;
         tArea.selectionStart = pos + 1;
         tArea.selectionEnd = pos + 1;
      }
      e.stopPropagation(); //bodyに行かせない
   };
   var onKeyUpForCodeArea = function(e){
      e.stopPropagation(); //bodyに行かせない
   };
   var onRunButtonClick = function(e){
      var textarea = document.getElementById('code');
      bootMachine(textarea.value);
   };
   var onMouseMove = function(e){
      var canvas = document.getElementById('screen');
      var rect = canvas.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var y = e.clientY - rect.top;
      input.x = x;
      input.y = y;
   };
   var onMouseDown = function(e){
      if (e.button === 1){
         input.buttonLeft = 1;
      }else if (e.button === 2){
         input.buttonRight = 1;
      }
      onMouseMove(e);
   };
   var onMouseUp = function(e){
      if (e.button === 1){
         input.buttonLeft = 0;
      }else if (e.button === 2){
         input.buttonRight = 0;
      }
      onMouseMove(e);
   };
   var onTouchStart = function(e){
      input.buttonLeft = 1;
      onTouchMove(e);
   };
   var onTouchEnd = function(e){
      input.buttonLeft = 0;
      onTouchMove(e);
   };
   var onTouchMove = function(e){
      if (e.changedTouches.length > 0){
         var touch = e.changedTouches[0];
         var canvas = document.getElementById('screen');
         var rect = canvas.getBoundingClientRect;
         var x = touch.clientX - rect.left;
         var y = touch.clientY - rect.top;
         input.x = x;
         input.y = y;
      }
   };

   var onKeyDown = function(e){
      if (e.keyCode === 37){ //左
         input.left = 1;
         e.preventDefault();
      }else if (e.keyCode === 39){ //右
         input.right = 1;
         e.preventDefault();
      }else if (e.keyCode === 38){ //上
         input.up = 1;
         e.preventDefault();
      }else if (e.keyCode === 40){ //下
         input.down = 1;
         e.preventDefault();
      }else if (e.keyCode === 32){ //space
         input.space = 1;
         e.preventDefault();
      }else if (e.keyCode === 13){ //enter
         input.enter = 1;
         e.preventDefault();
      }
   };
   var onKeyUp = function(e){
      if (e.keyCode === 37){ //左
         input.left = 0;
         e.preventDefault();
      }else if (e.keyCode === 39){ //右
         input.right = 0;
         e.preventDefault();
      }else if (e.keyCode === 38){ //上
         input.up = 0;
         e.preventDefault();
      }else if (e.keyCode === 40){ //下
         input.down = 0;
         e.preventDefault();
      }else if (e.keyCode === 32){ //space
         input.space = 0;
         e.preventDefault();
      }else if (e.keyCode === 13){ //enter
         input.enter = 0;
         e.preventDefault();
      }
   };
   var doc = document;
   var body = doc.body;
   body.addEventListener('dragover', onDragOver, false);
   body.addEventListener('drop', onDrop, false);
   body.addEventListener('mousemove', onMouseMove, false);
   body.addEventListener('mousedown', onMouseDown, false);
   body.addEventListener('mouseup', onMouseUp, false);
   body.addEventListener('keydown', onKeyDown, false);
   body.addEventListener('keyup', onKeyUp, false);
   doc.getElementById('runButton').addEventListener('click', onRunButtonClick, false);
   var codeArea = doc.getElementById('code');
   codeArea.addEventListener('dragover', onDragOver, false);
   codeArea.addEventListener('drop', onDrop, false);
   codeArea.addEventListener('keydown', onKeyDownForCodeArea, false);
   codeArea.addEventListener('keyup', onKeyUpForCodeArea, false);
   //実行開始
   display();
}());
