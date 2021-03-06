﻿#include "Base/Array.h"
#include "Base/String.h"
#include "Base/TextFile.h"
#include "Base/Utility.h"
#include "Base/MemoryPool.h"
#include "Compiler/Token.h"
#include "Compiler/LexicalAnalyzer.h"
#include "Compiler/TabProcessor.h"
#include "Compiler/CharacterReplacer.h"
#include "Compiler/CommentRemover.h"
#include "Compiler/Structurizer.h"
#include "Localization.h"

namespace Sunaba{

inline Concatenator::Concatenator(
Tank<String>* fullPathFilenames, 
std::wostringstream* messageStream,
const wchar_t* rootFilename,
MemoryPool* memoryPool,
const Localization& loc) :
mLine(0),
mFullPathFilenames(fullPathFilenames),
mMessageStream(messageStream),
mRootFilename(rootFilename),
mMemoryPool(memoryPool),
mLocalization(&loc){
}

inline Concatenator::~Concatenator(){
	mMessageStream = 0;
	mRootFilename = 0;
	mMemoryPool = 0;
	mLocalization = 0;
}

inline bool Concatenator::process( 
Array<Token>* tokensOut,
std::wostringstream* messageStream,
const wchar_t* rootFilename,
Tank<String>* fullPathFilenames,
MemoryPool* memoryPool,
const Localization& loc){
	Concatenator concatenator(fullPathFilenames, messageStream, rootFilename, memoryPool, loc);
	return concatenator.process(tokensOut, rootFilename);
}

inline bool Concatenator::process(Array<Token>* tokensOut, const wchar_t* filename){
	Token filenameToken;
	filenameToken.mString.set(filename, getStringSize(filename));
	filenameToken.mFilename = filenameToken.mString;
	if (!processFile(filenameToken, mRootFilename)){
		return false;
	}
	mTokens.add()->set(0, 0, TOKEN_END, 0, *mLocalization); //ファイル末端
	mTokens.copyTo(tokensOut);
	int n = tokensOut->size();
	if (n >= 2){ //END以外にもあるなら、Endのファイル名を一個前からもらう
		(*tokensOut)[n - 1].mFilename = (*tokensOut)[n - 2].mFilename;
	}
	return true;
}

inline bool Concatenator::processFile(const Token& filenameToken, const wchar_t* parentFullPath){
	const RefString& filename = filenameToken.mString;

	//ファイルを開けるためにフルパスを作る。
	//ファイル名がわかったので、開けて処理する。
	//NULL終端化が必要
	int l = filename.size();
	Array<wchar_t> tmpFilename(l + 4 + 1); //+4は拡張子省略時に.txtを足すため
	for (int i = 0; i < l; ++i){
		tmpFilename[i] = filename[i];
	}
	tmpFilename[l] = L'\0';

	Array<wchar_t> fullPath;
	makeAbsoluteFilename(&fullPath, parentFullPath, tmpFilename.pointer());
	// ファイルがあるか?
	if (fileExist(fullPath.pointer()) == false)
	{
		if (checkExtension(tmpFilename.pointer(), L"")){ //拡張子ないなら.txtを補う
			tmpFilename[l + 0] = L'.';
			tmpFilename[l + 1] = L't';
			tmpFilename[l + 2] = L'x';
			tmpFilename[l + 3] = L't';
			tmpFilename[l + 4] = L'\0';
		}
		makeAbsoluteFilename(&fullPath, parentFullPath, tmpFilename.pointer());
		if (fileExist(fullPath.pointer()) == false)
		{
			beginError(filenameToken);
			*mMessageStream << fullPath.pointer() << L"を開けない。あるのか確認せよ。" << std::endl;
			return false;
		}
	}
	//同じファイルを読んだことがないかフルパスでチェック。エラーにはせず、素通り。
	String* fnStr = mFullPathFilenames->add();
	fnStr->set(fullPath.pointer(), fullPath.size() - 1); //NULL終端をはずすために-1
	if (mFilenameSet.find(fnStr) != mFilenameSet.end()){
		return true;
	}
	mFilenameSet.insert(fnStr);

	InputTextFile file(fullPath.pointer());
	if (file.isError()){
		beginError(filenameToken);
		*mMessageStream << L"を開けない。あるのか確認せよ。" << std::endl;
		return false;
	}
	if ((file.text())->size() == 0){
		beginError(filenameToken);
		*mMessageStream << L"をテキストファイルとして解釈できない。文字コードは大丈夫か？そもそも本当にテキストファイルか？" << std::endl;
		return false;
	}
	//タブ処理
	Array<wchar_t> text;
	TabProcessor::process(&text, *(file.text()));
#ifndef NDEBUG
	{
		std::wostringstream s;
		s << L"log\\tabProcessed.";
		int p = getFilenameBegin(filename.pointer(), filename.size());
		s.write(filename.pointer() + p, filename.size() - p);
		OutputTextFile o(s.str().c_str());
		o.write(text.pointer(), text.size());
	}
#endif
	//\rなど、文字数を変えない範囲で邪魔なものを取り除く。
	{
		Array<wchar_t> tmp;
		CharacterReplacer::process(&tmp, text, *mLocalization);
		text.clear();
		tmp.moveTo(&text);
#ifndef NDEBUG
		{
			std::wostringstream s;
			s << L"log\\replaced.";
			int p = getFilenameBegin(filename.pointer(), filename.size());
			s.write(filename.pointer() + p, filename.size() - p);
			OutputTextFile o(s.str().c_str());
			o.write(text.pointer(), text.size());
		}
#endif
	}
	//コメントを削除する。行数は変えない。
	{
		Array<wchar_t> tmp;
		if (!CommentRemover::process(&tmp, text)){
			return false;
		}
		text.clear();
		tmp.moveTo(&text);
#ifndef NDEBUG
		{
			std::wostringstream s;
			s << L"log\\commentRemoved.";
			int p = getFilenameBegin(filename.pointer(), filename.size());
			s.write(filename.pointer() + p, filename.size() - p);
			OutputTextFile o(s.str().c_str());
			o.write(text.pointer(), text.size());
		}
#endif
	}
	//トークン分解
	//Token.mStringなどは元のテキストへの参照を持つため、コンパイル終了まで開放しないメモリにコピーを取る。
	wchar_t* finalText = mMemoryPool->create<wchar_t>(text.size());
	for (int i = 0; i < text.size(); ++i){
		finalText[i] = text[i];
	}
	Array<Token> tokens;
	if (!LexicalAnalyzer::process(&tokens, mMessageStream, finalText, text.size(), fnStr->pointer(), mLine, *mLocalization)){
		return false;
	}
#ifndef NDEBUG
	{
		std::wostringstream s;
		s << L"log\\lexicalAnalyzed.";
		int p = getFilenameBegin(filename.pointer(), filename.size());
		s.write(filename.pointer() + p, filename.size() - p);
		OutputTextFile o(s.str().c_str());
		s.str(L"");
		Token::toString(&s, tokens.pointer(), tokens.size());
		std::wstring ws = s.str();
		o.write(ws.c_str(), static_cast<int>(ws.size()));
	}
#endif
	//全トークンにファイル名を差し込む。そのためにファイル名だけにする。
	int begin = getFilenameBegin(filenameToken.mString.pointer(), filenameToken.mString.size());
	RefString bareFilename(filenameToken.mString.pointer() + begin, filenameToken.mString.size() - begin); 
	for (int i = 0; i < tokens.size(); ++i){
		tokens[i].mFilename = bareFilename;
	}
	{
		Array<Token> structurized;
		if (!Structurizer::process(&structurized, mMessageStream, &tokens, *mLocalization)){
			return false;
		}
		tokens.clear();
		structurized.moveTo(&tokens);
#ifndef NDEBUG
		{
			std::wostringstream s;
			s << L"log\\structurized.";
			int p = getFilenameBegin(filename.pointer(), filename.size());
			s.write(filename.pointer() + p, filename.size() - p);
			OutputTextFile o(s.str().c_str());
			s.str(L"");
			Token::toString(&s, tokens.pointer(), tokens.size());
			std::wstring ws = s.str();
			o.write(ws.c_str(), static_cast<int>(ws.size()));
		}
#endif
	}
	//改めて全トークンにファイル名を差し込む
	for (int i = 0; i < tokens.size(); ++i){
		tokens[i].mFilename = bareFilename;
	}
	//タンクにトークンを移動。
	//includeを探してそこだけ構文解析
	int tokenCount = tokens.size();
	for (int i = 0; i < tokenCount; ++i){
		if (tokens[i].mType == TOKEN_INCLUDE){ //発見
			if ((i + 2) >= tokenCount){
				beginError(filenameToken);
				*mMessageStream << L"挿入(include)行の途中でファイルが終わった。" << std::endl;
			}
			if (tokens[i + 1].mType != TOKEN_STRING_LITERAL){
				beginError(tokens[i]);
				*mMessageStream << L"挿入(include)と来たら、次は\"\"で囲まれたファイル名が必要。" << std::endl;
			}
			if (tokens[i + 2].mType != TOKEN_STATEMENT_END){
				beginError(tokens[i]);
				*mMessageStream << L"挿入(include)行に続けて何かが書いてある。改行しよう。" << std::endl;
			}
			if (!processFile(tokens[i + 1], fullPath.pointer())){
				return false;
			}
			i += 2;
		}else{
			mLine = tokens[i].mLine;
			mTokens.add(tokens[i]);
		}
	}
	return true;
}

inline void Concatenator::beginError(const Token& token) const{
	mMessageStream->write(token.mFilename.pointer(), token.mFilename.size());
	if (token.mLine != 0){
		*mMessageStream << L'(' << token.mLine << L") ";
	}else{
		*mMessageStream << L' ';
	}
}

} //namespace Sunaba
