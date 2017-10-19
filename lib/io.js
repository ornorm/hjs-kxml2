/** @babel */
import * as char from 'hjs-core/lib/char';
import * as util from 'hjs-core/lib/util';
import {InputStreamReader,Reader} from 'hjs-io/lib/reader';
import {
    FEATURE_PROCESS_NAMESPACES,
    START_DOCUMENT,
    END_DOCUMENT,
    START_TAG,
    END_TAG,
    TEXT,
    CDSECT,
    ENTITY_REF,
    IGNORABLE_WHITESPACE,
    PROCESSING_INSTRUCTION,
    COMMENT,
    DOCDECL,
    TYPES,
    NO_NAMESPACE,
    XmlPullParser,
    XmlPullParserFactory,
    XmlSerializer
} from "hjs-xmlpull/lib/v1";

const BUFFER_SIZE = 8192;

export const UNEXPECTED_EOF = "Unexpected EOF";
export const ILLEGAL_TYPE = "Wrong event type";
export const XML_DECL = 998;
export const LEGACY = 999;

export class KXmlParser extends XmlPullParser {

    constructor({size = BUFFER_SIZE}) {
        super();
        this.elementStack = new Array(16);
        this.nspStack = new Array(8);
        this.nspCounts = new Array(4);
        this.txtBuf = new Array(128);
        this.attributes = new Array(16);
        this.peeked = new Array(2);
        this.attributeCount = this.stackMismatch = this.depth = this.srcPos = this.srcCount = this.line = this.column = this.txtPos = this.peekCount = 0;
        this.relaxed = this.token = this.processNsp = this.isWhitespaceChar = this.degenerated = this.wasCR = this.unresolved = this.token = false;
        this.srcBuf = new Array(size);
        this.errors = null;
    }

    adjustNsp() {
        let any = false, attrName = null, attrPrefix = null, prefix = null, attrNs = null, cut = null, j = null;
        for (let i = 0; i < this.attributeCount << 2; i += 4) {
            attrName = this.attributes[i + 2];
            cut = attrName.indexOf(':');
            if (cut !== -1) {
                prefix = attrName.substring(0, cut);
                attrName = attrName.substring(cut + 1, attrName.length);
            } else if (attrName === "xmlns") {
                prefix = attrName;
                attrName = null;
            } else {
                continue;
            }
            if (prefix !== "xmlns") {
                any = true;
            } else {
                j = (this.nspCounts[this.depth]++) << 1;
                this.nspStack = this.ensureCapacity(this.nspStack, j + 2);
                this.nspStack[j] = attrName;
                this.nspStack[j + 1] = this.attributes[i + 3];
                if (attrName !== null && this.attributes[i + 3] === "") {
                    this.error("illegal empty namespace");
                }
                this.attributeCount = ((--this.attributeCount) << 2) - i;
                util.arraycopy(this.attributes, i + 4, this.attributes, i, ((--this.attributeCount) << 2) - i);
                i -= 4;
            }
        }
        if (any) {
            for (let i = (this.attributeCount << 2) - 4; i >= 0; i -= 4) {
                attrName = this.attributes[i + 2];
                cut = attrName.indexOf(':');
                if (cut === 0 && !this.relaxed) {
                    throw new SyntaxError("RuntimeException illegal attribute name: " + attrName + " at " + this);
                } else if (cut !== -1) {
                    attrPrefix = attrName.substring(0, cut);
                    attrName = attrName.substring(cut + 1, attrName.length);
                    attrNs = this.getNamespace(attrPrefix);
                    if (attrNs === null && !this.relaxed) {
                        throw new SyntaxError("RuntimeException Undefined Prefix: " + attrPrefix + " in " + this);
                    }
                    this.attributes[i] = attrNs;
                    this.attributes[i + 1] = attrPrefix;
                    this.attributes[i + 2] = attrName;
                }
            }
        }
        cut = this.name.indexOf(':');
        if (cut === 0) {
            this.error("illegal tag name: " + this.name);
        }
        if (cut !== -1) {
            this.prefix = this.name.substring(0, cut);
            this.name = this.name.substring(cut + 1, this.name.length);
        }
        this.namespace = this.getNamespace(this.prefix);
        if (this.namespace === null) {
            if (this.prefix !== null) {
                this.error("undefined prefix: " + this.prefix);
            }
            this.namespace = NO_NAMESPACE;
        }
        return any;
    }

    defineEntityReplacementText(entity, value) {
        if (this.entityMap === null) {
            throw new SyntaxError("RuntimeException entity replacement text must be defined after setInput!");
        }
        this.entityMap[entity] = value;
    }

    ensureCapacity(arr, required) {
        if (arr.length >= required) {
            return arr;
        }
        let bigger = new Array(required + 16);
        util.arraycopy(arr, 0, bigger, 0, arr.length);
        return bigger;
    }

    error(desc) {
        if (this.relaxed) {
            if (this.errors === null) {
                this.errors = "ERR: " + desc;
            }
        } else {
            this.exception(desc);
        }
    }

    exception(desc) {
        throw new SyntaxError("XmlPullParserException " + (desc.length < 100 ? desc : desc.substring(0, 100) + "\n"));
    }

    get(pos) {
        let len = this.txtPos - pos;
        let buf = this.txtBuf.slice(pos, pos + len);
        let out = '';
        for (let i = 0; i < buf.length; i++) {
            out += String.fromCharCode(buf[i]);
        }
        return out;
    }

    getAttributeCount() {
        return this.attributeCount;
    }

    getAttributeName(index) {
        if (index >= this.attributeCount) {
            throw new Error("IndexOutOfBoundsException");
        }
        return this.attributes[(index << 2) + 2];
    }

    getAttributeNamespace(index) {
        if (index >= this.attributeCount) {
            throw new Error("IndexOutOfBoundsException");
        }
        return this.attributes[index << 2];
    }

    getAttributePrefix(index) {
        if (index >= this.attributeCount) {
            throw new Error("IndexOutOfBoundsException");
        }
        return this.attributes[(index << 2) + 1];
    }

    getAttributeType(index) {
        return "CDATA";
    }

    getAttributeValue(index, name) {
        if (name !== null && typeof name === "string") {
            let namespace = index;
            for (let i = (this.attributeCount << 2) - 4; i >= 0; i -= 4) {
                if (this.attributes[i + 2] === name && (namespace === null || this.attributes[i] === namespace)) {
                    return this.attributes[i + 3];
                }
            }
            return null;
        }
        if (index >= this.attributeCount) {
            throw new RangeError("IndexOutOfBoundsException");
        }
        return this.attributes[(index << 2) + 3];
    }

    getColumnNumber() {
        return this.column;
    }

    getDepth() {
        return this.depth;
    }

    getEventType() {
        return this.type;
    }

    getFeature(feature) {
        if (FEATURE_PROCESS_NAMESPACES === feature) {
            return this.processNsp;
        } else if (this.isProp(feature, false, "relaxed")) {
            return this.relaxed;
        }
        return false;
    }

    getInputEncoding() {
        return this.encoding;
    }

    getLineNumber() {
        return this.line;
    }

    getName() {
        return this.name;
    }

    getNamespace(prefix) {
        if (prefix === null) {
            return this.namespace;
        }
        if ("xml" === prefix) {
            return "http://www.w3.org/XML/1998/namespace";
        }
        if ("xmlns" === prefix) {
            return "http://www.w3.org/2000/xmlns/";
        }
        for (let i = (this.getNamespaceCount(this.depth) << 1) - 2; i >= 0; i -= 2) {
            if (prefix !== null) {
                if (this.nspStack[i] === null) {
                    return this.nspStack[i + 1];
                }
            } else if (prefix === this.nspStack[i]) {
                return this.nspStack[i + 1];
            }
        }
        return null;
    }

    getNamespaceCount(depth) {
        if (depth > this.depth) {
            throw new RangeError("IndexOutOfBoundsException");
        }
        return this.nspCounts[depth];
    }

    getNamespacePrefix(pos) {
        return this.nspStack[pos << 1];
    }

    getNamespaceUri(pos) {
        return this.nspStack[(pos << 1) + 1];
    }

    getPositionDescription() {
        let buf = this.type < TYPES.length ? TYPES[this.type] : "unknown";
        buf += " ";
        if (this.type === START_TAG || this.type === END_TAG) {
            if (this.degenerated) {
                buf += "(empty) ";
            }
            buf += "<";
            if (this.type === END_TAG) {
                buf += "/";
            }
            if (this.prefix !== null) {
                buf += "{" + this.namespace + "}" + this.prefix + ":";
            }
            buf += this.name;
            let cnt = this.attributeCount << 2;
            for (let i = 0; i < cnt; i += 4) {
                buf += " ";
                if (this.attributes[i + 1] !== null) {
                    buf += "{" + this.attributes[i] + "}" + this.attributes[i + 1] + ":";
                }
                buf += this.attributes[i + 2] + "='" + this.attributes[i + 3] + "'";
            }
            buf += ">";
        } else if (this.type === IGNORABLE_WHITESPACE) {

        } else if (this.type !== TEXT) {
            buf += this.getText();
        } else if (this.isWhitespaceChar) {
            buf += "(whitespace)";
        } else {
            let text = this.getText();
            if (text.length > 16) {
                text = text.substring(0, 16) + "...";
            }
            buf += text;
        }
        buf += "@" + this.line + ":" + this.column;
        if (this.location !== null) {
            buf += " in ";
            buf += this.location;
        } else if (this.reader !== null) {
            buf += " in ";
            buf += this.reader.toString();
        }
        return buf;
    }

    getPrefix() {
        return this.prefix;
    }

    getProperty(property) {
        if (this.isProp(property, true, "xmldecl-version")) {
            return this.version;
        }
        if (this.isProp(property, true, "xmldecl-standalone")) {
            return this.standalone;
        }
        if (this.isProp(property, true, "location")) {
            return this.location !== null ? this.location : this.reader.toString();
        }
        return null;
    }

    getText() {
        return this.type < TEXT || (this.type === ENTITY_REF && this.unresolved) ? null : this.get(0);
    }

    getTextCharacters(poslen) {
        if (this.type >= TEXT) {
            if (this.type === ENTITY_REF) {
                poslen[0] = 0;
                poslen[1] = this.name.length;
                return this.name.join("");
            }
            poslen[0] = 0;
            poslen[1] = this.txtPos;
            return this.txtBuf;
        }
        poslen[0] = -1;
        poslen[1] = -1;
        return null;
    }

    isAttributeDefault(index) {
        return false;
    }

    isEmptyElementTag() {
        if (this.type !== START_TAG) {
            this.exception(ILLEGAL_TYPE);
        }
        return this.degenerated;
    }

    isProp(n1, prop, n2) {
        if (!char.startsWith(n1, "http://xmlpull.org/v1/doc/")) {
            return false;
        }
        if (prop) {
            return n1.substring(42, n1.length) === n2;
        }
        return n1.substring(40, n1.length) === n2;
    }

    isWhitespace() {
        if (this.type !== TEXT && this.type !== IGNORABLE_WHITESPACE && this.type !== CDSECT) {
            this.exception(ILLEGAL_TYPE);
        }
        return this.isWhitespaceChar;
    }

    next() {
        this.txtPos = 0;
        this.isWhitespaceChar = true;
        let minType = 9999;
        this.token = false;
        do {
            this.nextImpl();
            if (this.type < minType) {
                minType = this.type;
            }
        } while (minType > ENTITY_REF || (minType >= TEXT && this.peekType() >= TEXT));
        this.type = minType;
        if (this.type > TEXT) {
            this.type = TEXT;
        }
        return this.type;
    }

    nextImpl() {
        if (this.reader === null) {
            this.exception("No Input specified");
        }
        if (this.type === END_TAG) {
            this.depth--;
        }
        let sp = null;
        while (true) {
            this.attributeCount = -1;
            if (this.degenerated) {
                this.degenerated = false;
                this.type = END_TAG;
                return;
            }
            if (this.errors !== null) {
                for (let i = 0; i < this.errors.length; i++) {
                    this.push(this.errors.charAt(i));
                }
                this.errors = null;
                this.type = COMMENT;
                return;
            }
            if (this.relaxed && (this.stackMismatch > 0 || (this.peek(0) === -1 && this.depth > 0))) {
                sp = (this.depth - 1) << 2;
                this.type = END_TAG;
                this.namespace = this.elementStack[sp];
                this.prefix = this.elementStack[sp + 1];
                this.name = this.elementStack[sp + 2];
                if (this.stackMismatch !== 1) {
                    this.errors = "missing end tag /" + this.name + " inserted";
                }
                if (this.stackMismatch > 0) {
                    this.stackMismatch--;
                }
                return;
            }
            this.prefix = null;
            this.name = null;
            this.namespace = null;
            this.type = this.peekType();
            switch (this.type) {
                case ENTITY_REF :
                    this.pushEntity();
                    return;
                case START_TAG :
                    this.parseStartTag(false);
                    return;
                case END_TAG :
                    this.parseEndTag();
                    return;
                case END_DOCUMENT :
                    return;
                case TEXT :
                    this.pushText(char.LEFT_ANGLE, !this.token);
                    if (this.depth === 0) {
                        if (this.isWhitespaceChar) {
                            this.type = IGNORABLE_WHITESPACE;
                        }
                    }
                    return;
                default :
                    this.type = this.parseLegacy(this.token);
                    if (this.type !== XML_DECL) {
                        return;
                    }
            }
        }
    }

    nextTag() {
        this.next();
        if (this.type === TEXT && this.isWhitespaceChar) {
            this.next();
        }
        if (this.type !== END_TAG && this.type !== START_TAG) {
            this.exception("unexpected type");
        }
        return this.type;
    }

    nextText() {
        if (this.type !== START_TAG) {
            this.exception("precondition: START_TAG");
        }
        this.next();
        let result;
        if (this.type === TEXT) {
            result = this.getText();
            this.next();
        } else {
            result = "";
        }
        if (this.type !== END_TAG) {
            this.exception("END_TAG expected");
        }
        return result;
    }

    nextToken() {
        this.isWhitespaceChar = true;
        this.txtPos = 0;
        this.token = true;
        this.nextImpl();
        return this.type;
    }

    parseDoctype(push) {
        let nesting = 1;
        let quoted = false;
        while (true) {
            let i = this.read();
            switch (i) {
                case -1 :
                    this.error(UNEXPECTED_EOF);
                    return;
                case char.SINGLE_QUOTE:
                    quoted = !quoted;
                    break;
                case char.LEFT_ANGLE :
                    if (!quoted) {
                        nesting++;
                    }
                    break;
                case char.RIGHT_ANGLE:
                    if (!quoted) {
                        if ((--nesting) === 0) {
                            return;
                        }
                    }
                    break;
            }
            if (push) {
                this.push(i);
            }
        }
    }

    parseEndTag() {
        this.read();
        this.read();
        this.name = this.readName();
        this.skip();
        this.read(char.RIGHT_ANGLE);
        let sp = (this.depth - 1) << 2;
        if (this.depth === 0) {
            this.error("element stack empty");
            this.type = COMMENT;
            return;
        }
        if (this.name !== this.elementStack[sp + 3]) {
            this.error("expected: /" + this.elementStack[sp + 3] + " read: " + this.name);
            let probe = sp;
            while (probe >= 0 && this.name.toLowerCase() !== this.elementStack[probe + 3].toLowerCase()) {
                this.stackMismatch++;
                probe -= 4;
            }
            if (probe < 0) {
                this.stackMismatch = 0;
                this.type = COMMENT;
                return;
            }
        }
        this.namespace = this.elementStack[sp];
        this.prefix = this.elementStack[sp + 1];
        this.name = this.elementStack[sp + 2];
    }

    parseLegacy(push) {
        let prev = 0, req = "", term = null, result = null, pos = null, st = null;
        this.read();
        let c = this.read();
        if (c === char.QUESTION_MARK) {
            if ((this.peek(0) === char.x || this.peek(0) === char.X) &&
                (this.peek(1) === char.m || this.peek(1) === char.M)) {
                if (push) {
                    this.push(this.peek(0));
                    this.push(this.peek(1));
                }
                if ((this.peek(0) === char.l || this.peek(0) === char.L) && this.peek(1) <= char.SPACE) {
                    if (this.line !== 1 || this.column > 4) {
                        this.error("PI must not start with xml");
                    }
                    this.parseStartTag(true);
                    if (this.attributeCount < 1 || "version" !== this.attributes[2]) {
                        this.error("version expected");
                    }
                    this.version = this.attributes[3];
                    pos = 1;
                    if (pos < this.attributeCount && "encoding" === this.attributes[2 + 4]) {
                        this.encoding = this.attributes[3 + 4];
                        pos++;
                    }
                    if (pos < this.attributeCount && "standalone" === this.attributes[4 * pos + 2]) {
                        st = this.attributes[3 + 4 * pos];
                        if ("yes" === st) {
                            this.standalone = true;
                        } else if ("no" === st) {
                            this.standalone = false;
                        } else {
                            this.error("illegal standalone value: " + st);
                        }
                        pos++;
                    }
                    if (pos !== this.attributeCount) {
                        this.error("illegal xmldecl");
                    }
                    this.isWhitespaceChar = true;
                    this.txtPos = 0;
                    return XML_DECL;
                }
            }
            term = char.QUESTION_MARK;
            result = PROCESSING_INSTRUCTION;
        } else if (c === char.BANG) {
            if (this.peek(0) === char.DASH) {
                result = COMMENT;
                req = "--";
                term = char.DASH;
            } else if (this.peek(0) === char.LEFT_BRACKET) {
                result = CDSECT;
                req = "[CDATA[";
                term = char.RIGHT_BRACKET;
                push = true;
            } else {
                result = DOCDECL;
                req = "DOCTYPE";
                term = -1;
            }
        } else {
            this.error("illegal: <" + String.fromCharCode(c));
            return COMMENT;
        }
        for (let i = 0; i < req.length; i++) {
            this.read(req.charAt(i));
        }
        if (result === DOCDECL) {
            this.parseDoctype(push);
        } else {
            while (true) {
                c = this.read();
                if (c === -1) {
                    this.error(UNEXPECTED_EOF);
                    return COMMENT;
                }
                if (push) {
                    this.push(c);
                }
                if ((term === char.QUESTION_MARK || c === term) &&
                    this.peek(0) === term && this.peek(1) === char.RIGHT_ANGLE) {
                    break;
                }
                prev = c;
            }
            if (term === char.DASH && prev === char.DASH) {
                this.error("illegal comment delimiter: --->");
            }
            this.read();
            this.read();
            if (push && term !== char.QUESTION_MARK) {
                this.txtPos--;
            }
        }
        return result;
    }

    parseStartTag(xmldecl) {
        if (!xmldecl) {
            this.read();
        }
        this.name = this.readName();
        this.attributeCount = 0;
        while (true) {
            this.skip();
            let c = this.peek(0);
            if (xmldecl) {
                if (c === char.QUESTION_MARK) {
                    this.read();
                    this.read(char.RIGHT_ANGLE);
                    return;
                }
            } else {
                if (c === char.SLASH) {
                    this.degenerated = true;
                    this.read();
                    this.skip();
                    this.read(char.RIGHT_ANGLE);
                    break;
                }
                if (c === char.RIGHT_ANGLE && !xmldecl) {
                    this.read();
                    break;
                }
            }
            if (c === -1) {
                this.error(UNEXPECTED_EOF);
                return;
            }
            let attrName = this.readName();
            if (attrName.length === 0) {
                this.error("attr name expected");
                break;
            }
            let i = (this.attributeCount++) << 2;
            this.attributes[i++] = "";
            this.attributes[i++] = null;
            this.attributes[i++] = attrName;
            this.skip();
            if (this.peek(0) !== char.EQUAL) {
                this.error("Attr.value missing f. " + attrName);
                this.attributes[i] = "1";
            } else {
                this.read(char.EQUAL);
                this.skip();
                let delimiter = this.peek(0);
                if (delimiter !== char.SINGLE_QUOTE && delimiter !== char.DOUBLE_QUOTE) {
                    this.error("attr value delimiter missing!");
                    delimiter = char.SPACE;
                } else {
                    this.read();
                }
                let p = this.txtPos;
                this.pushText(delimiter, true);
                this.attributes[i] = this.get(p);
                this.txtPos = p;
                if (delimiter !== char.SPACE) {
                    this.read();
                }
            }
        }
        let sp = this.depth++ << 2;
        this.elementStack[sp + 3] = this.name;
        this.nspCounts[this.depth] = this.nspCounts[this.depth - 1];
        if (this.processNsp) {
            this.adjustNsp();
        } else {
            this.namespace = "";
        }
        this.elementStack[sp] = this.namespace;
        this.elementStack[sp + 1] = this.prefix;
        this.elementStack[sp + 2] = this.name;
    }

    peek(pos) {
        let nw = null;
        while (pos >= this.peekCount) {
            if (this.srcBuf.length <= 1) {
                nw = this.reader.read();
            } else if (this.srcPos < this.srcCount) {
                nw = this.srcBuf[this.srcPos++];
            } else {
                this.srcCount = this.reader.read(this.srcBuf, 0, this.srcBuf.length);
                if (this.srcCount <= 0) {
                    nw = -1;
                } else {
                    nw = this.srcBuf[0];
                }
                this.srcPos = 1;
            }
            if (nw === char.CARRIAGE_RETURN) {
                this.wasCR = true;
                this.peeked[this.peekCount++] = char.NEWLINE;
            } else {
                if (nw === char.NEWLINE) {
                    if (!this.wasCR) {
                        this.peeked[this.peekCount++] = char.NEWLINE;
                    }
                } else {
                    this.peeked[this.peekCount++] = nw;
                }
                this.wasCR = false;
            }
        }
        return this.peeked[pos];
    }

    peekType() {
        let c = this.peek(0);
        switch (c) {
            case -1 :
                return END_DOCUMENT;
            case char.AMPERSAND :
                return ENTITY_REF;
            case char.LEFT_ANGLE :
                let d = this.peek(1);
                switch (d) {
                    case char.SLASH :
                        return END_TAG;
                    case char.QUESTION_MARK :
                    case char.BANG :
                        return LEGACY;
                    default :
                        return START_TAG;
                }
            default :
                return TEXT;
        }
    }

    push(c) {
        this.isWhitespaceChar &= c <= char.SPACE;
        this.txtBuf[this.txtPos++] = c;
    }

    pushEntity() {
        this.push(this.read());
        let pos = this.txtPos;
        while (true) {
            let c = this.read();
            if (c === char.SEMICOLON) {
                break;
            }
            if (c < 128 && (c < char.ZERO ||
                c > char.NINE) && (c < char.a ||
                c > char.z) && (c < char.A ||
                c > char.Z) && c !== char.UNDER_SCORE &&
                c !== char.DASH && c !== char.SHARP) {
                if (!this.relaxed) {
                    this.error("unterminated entity ref");
                }
                if (c !== -1) {
                    this.push(c);
                }
                return;
            }
            this.push(c);
        }
        let code = this.get(pos);
        this.txtPos = pos - 1;
        if (this.token && this.type === ENTITY_REF) {
            this.name = code;
        }
        if (code.charAt(0) === '#') {
            let c = (code.charAt(1) === 'x' ?
                parseInt(code.substring(2, code.length), 16) : parseInt(code.substring(1, code.length)));
            this.push(c);
            return;
        }
        let result = this.entityMap[code];
        this.unresolved = result === null;
        if (this.unresolved) {
            if (!this.token) {
                this.error("unresolved: &" + code + ";");
            }
        } else {
            for (let i = 0; i < result.length; i++) {
                this.push(result.charAt(i));
            }
        }
    }

    pushText(delimiter, resolveEntities=false) {
        let next = this.peek(0), cbrCount = 0;
        while (next !== null && next !== -1 && next !== delimiter) {
            if (delimiter === char.SPACE) {
                if (next <= char.SPACE || next === char.RIGHT_ANGLE) {
                    break;
                }
            }
            if (next === char.AMPERSAND) {
                if (!resolveEntities) {
                    break;
                }
                this.pushEntity();
            } else if (next === char.NEWLINE && this.type === START_TAG) {
                this.read();
                this.push(char.SPACE);
            } else {
                this.push(this.read());
            }
            if (next === char.RIGHT_ANGLE && cbrCount >= 2 && delimiter !== char.RIGHT_BRACKET) {
                this.error("Illegal: ]]>");
            }
            if (next === char.RIGHT_BRACKET) {
                cbrCount++;
            } else {
                cbrCount = 0;
            }
            next = this.peek(0);
        }
    }

    read(c = null) {
        if (c !== null) {
            let a = this.read();
            if (typeof c === "string") {
                c = c.charCodeAt(0);
            }
            if (a !== c) {
                this.error("expected: '" + c + "' actual: '" + String.fromCharCode(a) + "'");
            }
        } else {
            let result = null;
            if (this.peekCount === 0) {
                result = this.peek(0);
            } else {
                result = this.peeked[0];
                this.peeked[0] = this.peeked[1];
            }
            this.peekCount--;
            this.column++;
            if (result === char.NEWLINE) {
                this.line++;
                this.column = 1;
            }
            return result;
        }
    }

    readName() {
        let pos = this.txtPos;
        let c = this.peek(0);
        if ((c < char.a || c > char.z) &&
            (c < char.A || c > char.Z) &&
            c !== char.UNDER_SCORE &&
            c !== char.COLON &&
            c < 0x0c0 && !this.relaxed) {
            this.error("name expected");
        }
        do {
            this.push(this.read());
            c = this.peek(0);
        } while ((c >= char.a && c <= char.z) ||
        (c >= char.A && c <= char.Z) ||
        (c >= char.ZERO && c <= char.NINE) ||
        c === char.UNDER_SCORE ||
        c === char.DASH ||
        c === char.COLON ||
        c === char.DOT || c >= 0x0b7);
        let result = this.get(pos);
        this.txtPos = pos;
        return result;
    }

    release() {
        this.elementStack = null;
        this.nspStack = null;
        this.nspCounts = null;
        this.txtBuf = null;
        this.attributes = null;
        this.peeked = null;
        this.attributeCount = this.stackMismatch = this.depth = this.srcPos = this.srcCount = this.line = this.column = this.txtPos = this.peekCount = 0;
        this.relaxed = this.token = this.processNsp = this.isWhitespaceChar = this.degenerated = this.wasCR = this.unresolved = this.token = false;
        this.srcBuf = null;
        this.errors = null;
    }

    require(type, namespace, name) {
        if ((type !== this.type)
            || (namespace !== null && namespace.length > 0 && namespace !== this.getNamespace())
            || (name !== null && name !== this.getName())) {
            this.exception("expected: " + TYPES[type] + " {" + namespace + "} " + name)
        }
    }

    setFeature(feature, value) {
        if (FEATURE_PROCESS_NAMESPACES === feature) {
            this.processNsp = value;
        } else if (this.isProp(feature, false, "relaxed")) {
            this.relaxed = value;
        } else {
            this.exception("unsupported feature: " + feature);
        }
    }

    setInput(input, inputEncoding = 'UTF-8') {
        if (input === null) {
            throw new ReferenceError('NullPointerException');
        }
        if (input instanceof Reader) {
            this.reader = input;
            this.line = 1;
            this.column = 0;
            this.type = START_DOCUMENT;
            this.name = this.namespace = this.encoding = this.version = this.standalone = null;
            this.degenerated = false;
            this.attributeCount = -1;
            this.srcPos = this.srcCount = this.peekCount = this.depth = 0;
            this.entityMap = {
                "amp": char.AMPERSAND,
                "apos": char.SINGLE_QUOTE,
                "gt": char.RIGHT_ANGLE,
                "lt": char.LEFT_ANGLE,
                "quot": char.DOUBLE_QUOTE
            };
        } else {
            this.srcPos = this.srcCount = 0;
            let is = input;
            let enc = inputEncoding;
            try {
                if (enc === null) {
                    let chk = 0, i = null;
                    while (this.srcCount < 4) {
                        i = is.read();
                        if (i === -1) {
                            break;
                        }
                        chk = (chk << 8) | i;
                        this.srcBuf[this.srcCount++] = i;
                    }
                    if (this.srcCount === 4) {
                        switch (chk) {
                            case 0x00000FEFF :
                                enc = "UTF-32BE";
                                this.srcCount = 0;
                                break;
                            case 0x0FFFE0000 :
                                enc = "UTF-32LE";
                                this.srcCount = 0;
                                break;
                            case 0x03c :
                                enc = "UTF-32BE";
                                this.srcBuf[0] = char.LEFT_ANGLE;
                                this.srcCount = 1;
                                break;
                            case 0x03c000000 :
                                enc = "UTF-32LE";
                                this.srcBuf[0] = char.LEFT_ANGLE;
                                this.srcCount = 1;
                                break;
                            case 0x0003c003f :
                                enc = "UTF-16BE";
                                this.srcBuf[0] = char.LEFT_ANGLE;
                                this.srcBuf[1] = char.QUESTION_MARK;
                                this.srcCount = 2;
                                break;
                            case 0x03c003f00 :
                                enc = "UTF-16LE";
                                this.srcBuf[0] = char.LEFT_ANGLE;
                                this.srcBuf[1] = char.QUESTION_MARK;
                                this.srcCount = 2;
                                break;
                            case 0x03c3f786d :
                                while (true) {
                                    i = is.read();
                                    if (i === -1) {
                                        break;
                                    }
                                    this.srcBuf[this.srcCount++] = i;
                                    if (i === char.RIGHT_ANGLE) {
                                        let tmpBuf = this.srcBuf.slice(0, this.srcCount);
                                        let s = '';
                                        for (let j = 0; j < tmpBuf; j++) {
                                            s += String.fromCharCode(tmpBuf[j]);
                                        }
                                        let i0 = s.indexOf("encoding");
                                        if (i0 !== -1) {
                                            while (s.charAt(i0) !== '"' && s.charAt(i0) !== '\'') {
                                                i0++;
                                            }
                                            let deli = s.charAt(i0++);
                                            let i1 = char.indexOf(s, deli, i0);
                                            enc = s.substring(i0, i0 + i1);
                                        }
                                        break;
                                    }
                                }
                            default :
                                if ((chk & 0x0ffff0000) === 0x0FEFF0000) {
                                    enc = "UTF-16BE";
                                    this.srcBuf[0] = ((this.srcBuf[2] << 8) | this.srcBuf[3]);
                                    this.srcCount = 1;
                                } else if ((chk & 0x0ffff0000) === 0x0fffe0000) {
                                    enc = "UTF-16LE";
                                    this.srcBuf[0] = ((this.srcBuf[3] << 8) | this.srcBuf[2]);
                                    this.srcCount = 1;
                                } else if ((chk & 0x0ffffff00) === 0x0EFBBBF00) {
                                    enc = "UTF-8";
                                    this.srcBuf[0] = this.srcBuf[3];
                                    this.srcCount = 1;
                                }
                        }
                    }
                }
                let sc = this.srcCount;
                this.setInput(new InputStreamReader(is, enc));
                this.encoding = enc;
                this.srcCount = sc;
            } catch (e) {
                throw new SyntaxError("XmlPullParserException Invalid stream or encoding: " + e.message);
            }
        }
    }

    setProperty(property, value) {
        if (this.isProp(property, true, "location")) {
            this.location = value;
        } else {
            throw new SyntaxError("XmlPullParserException unsupported property: " + property);
        }
    }

    skip() {
        while (true) {
            let c = this.peek(0);
            if (c > char.SPACE || c === -1) {
                break;
            }
            this.read();
        }
    }

    skipSubTree() {
        this.require(START_TAG, null, null);
        let level = 1, eventType = null;
        while (level > 0) {
            eventType = this.next();
            if (eventType === END_TAG) {
                --this.level;
            } else if (eventType === START_TAG) {
                ++this.level;
            }
        }
    }
}

export class KXmlSerializer extends XmlSerializer {

    constructor() {
        super();
        this.writeEmptyPrefix = false;
        this.pending = this.unicode = false;
        this.auto = this.depth = 0;
        this.elementStack = new Array(12);
        this.nspCounts = new Array(4);
        this.nspStack = new Array(8);
        this.indent = new Array(4);
    }

    attribute(namespace=null, name, value) {
        if (!this.pending) {
            throw new SyntaxError("IllegalStateException illegal position for attribute");
        }
        if (namespace === null) {
            namespace = "";
        }
        let prefix = "" === namespace ? "" : this.getPrefix(namespace, true, false);
        this.writer.write(' ');
        if ("" === prefix && this.writeEmptyPrefix) {
            this.writer.write(prefix);
            this.writer.write(':');
        }
        this.writer.write(name);
        this.writer.write('=');
        let q = value.indexOf('"') === -1 ? '"' : '\'';
        this.writer.write(q);
        this.writeEscaped(value, q);
        this.writer.write(q);
        return this;
    }

    cdsect(data) {
        this.check(false);
        this.writer.write("<![CDATA[");
        this.writer.write(data);
        this.writer.write("]]>");
    }

    check(close) {
        if (!this.pending) {
            return;
        }
        this.depth++;
        this.pending = false;
        if (this.indent.length <= this.depth) {
            let hlp = new Array(this.depth + 4);
            util.arraycopy(this.indent, 0, hlp, 0, this.depth);
            this.indent = hlp;
        }
        this.indent[this.depth] = this.indent[this.depth - 1];
        for (let i = this.nspCounts[this.depth - 1]; i < this.nspCounts[this.depth]; i++) {
            this.writer.write(' ');
            this.writer.write("xmlns");
            if ("" !== this.nspStack[i * 2]) {
                this.writer.write(':');
                this.writer.write(this.nspStack[i * 2]);
            } else if ("" === this.getNamespace() && "" !== this.nspStack[i * 2 + 1]) {
                throw new SyntaxError("Cannot set default namespace for elements in no namespace");
            }
            this.writer.write("=\"");
            this.writeEscaped(this.nspStack[i * 2 + 1], '"');
            this.writer.write('"');
        }
        if (this.nspCounts.length <= this.depth + 1) {
            let hlp = new Array(this.depth + 8);
            util.arraycopy(this.nspCounts, 0, hlp, 0, this.depth + 1);
            this.nspCounts = hlp;
        }
        this.nspCounts[this.depth + 1] = this.nspCounts[this.depth];
        //   nspCounts[depth + 2] = nspCounts[depth];
        this.writer.write(close ? " />" : ">");
    }

    comment(txt) {
        this.check(false);
        this.writer.write("<!--");
        this.writer.write(txt);
        this.writer.write("-->");
    }

    docdecl(dd) {
        this.writer.write("<!DOCTYPE");
        this.writer.write(dd);
        this.writer.write(">");
    }

    endDocument() {
        while (this.depth > 0) {
            this.endTag(this.elementStack[this.depth * 3 - 3], this.elementStack[this.depth * 3 - 1]);
        }
        this.flush();
    }

    endTag(namespace=null, name) {
        if (!this.pending) {
            this.depth--;
        }
        if ((namespace === null) && (this.elementStack[this.depth * 3] !== null) ||
            (namespace !== null) && (namespace !== this.elementStack[this.depth * 3]) ||
            this.elementStack[this.depth * 3 + 2] !== name) {
            throw new SyntaxError("IllegalArgumentException </{" + namespace + "}" + name + "> does not match start");
        }
        if (this.pending) {
            this.check(true);
            this.depth--;
        } else {
            if (this.indent[this.depth + 1]) {
                this.writer.write("\r\n");
                for (let i = 0; i < this.depth; i++) {
                    this.writer.write("  ");
                }
            }
            this.writer.write("</");
            let prefix = this.elementStack[this.depth * 3 + 1];
            if ("" !== prefix && this.writeEmptyPrefix) {
                this.writer.write(prefix);
                this.writer.write(':');
            }
            this.writer.write(name);
            this.writer.write('>');
        }
        this.nspCounts[this.depth + 1] = this.nspCounts[this.depth];
        return this;
    }

    entityRef(name) {
        this.check(false);
        this.writer.write('&');
        this.writer.write(name);
        this.writer.write(';');
    }

    flush() {
        this.check(false);
        this.writer.flush();
    }

    getDepth() {
        return this.pending ? this.depth + 1 : this.depth;
    }

    getName() {
        let n = this.getDepth();
        return n === 0 ? null : this.elementStack[n * 3 - 1];
    }

    getNamespace() {
        let n = this.getDepth();
        return n === 0 ? null : this.elementStack[n * 3 - 3];
    }

    getFeature(name) {
        return ("http://xmlpull.org/v1/doc/features.html#indent-output" === name) ? this.indent[this.depth] : false;
    }

    getPrefix(namespace, create, includeDefault = false) {
        let cand = null;
        for (let i = this.nspCounts[this.depth + 1] * 2 - 2; i >= 0; i -= 2) {
            if (this.nspStack[i + 1] === namespace && (includeDefault || this.nspStack[i] !== "")) {
                cand = this.nspStack[i];
                for (let j = i + 2; j < this.nspCounts[this.depth + 1] * 2; j++) {
                    if (this.nspStack[j] === cand) {
                        cand = null;
                        break;
                    }
                }
                if (cand !== null) {
                    return cand;
                }
            }
        }
        if (!create) {
            return null;
        }
        let prefix = null;
        if ("" === namespace) {
            prefix = "";
        } else {
            do {
                prefix = "n" + (this.auto++);
                for (let i = this.nspCounts[this.depth + 1] * 2 - 2; i >= 0; i -= 2) {
                    if (prefix === this.nspStack[i]) {
                        prefix = null;
                        break;
                    }
                }
            } while (prefix === null);
        }
        let p = this.pending;
        this.pending = false;
        this.setPrefix(prefix, namespace);
        this.pending = p;
        return prefix;
    }

    getProperty(name) {
        throw new SyntaxError("RuntimeException Unsupported property");
    }

    ignorableWhitespace(s) {
        this.text(s);
    }

    processingInstruction(pi) {
        this.check(false);
        this.writer.write("<?");
        this.writer.write(pi);
        this.writer.write("?>");
    }

    setFeature(name, value) {
        if ("http://xmlpull.org/v1/doc/features.html#indent-output" === name) {
            this.indent[this.depth] = value;
        } else {
            throw new SyntaxError("RuntimeException Unsupported Feature");
        }
    }

    setPrefix(prefix = "", namespace = "") {
        this.check(false);
        let defined = this.getPrefix(namespace, false, true);
        if (prefix === defined) {
            return;
        }
        let pos = (this.nspCounts[this.depth + 1]++) << 1;
        this.nspStack[pos++] = prefix;
        this.nspStack[pos] = namespace;
    }

    setProperty(name, value) {
        throw new SyntaxError("RuntimeException Unsupported Property:" + value);
    }

    setOutput(writer, writeEmptyPrefix=false) {
        this.writer = writer;
        this.nspCounts[0] = 2;
        this.nspCounts[1] = 2;
        this.nspStack[0] = "";
        this.nspStack[1] = "";
        this.nspStack[2] = "xml";
        this.nspStack[3] = "http://www.w3.org/XML/1998/namespace";
        this.pending = false;
        this.auto = this.depth = 0;
        this.unicode = false;
        this.writeEmptyPrefix = writeEmptyPrefix;
    }

    startDocument(encoding, standalone) {
        this.writer.write("<?xml version='1.0' ");
        if (encoding !== null) {
            this.encoding = encoding;
            if (encoding.toLowerCase().indexOf("utf") === 0) {
                this.unicode = true;
            }
        }
        if (encoding !== null) {
            this.writer.write("encoding='");
            this.writer.write(this.encoding);
            this.writer.write("' ");
        }
        if (standalone !== null) {
            this.writer.write("standalone='");
            this.writer.write(standalone ? "yes" : "no");
            this.writer.write("' ");
        }
        this.writer.write("?>");
    }

    startTag(namespace=null, name) {
        this.check(false);
        if (this.indent[this.depth]) {
            this.writer.write("\r\n");
            for (let i = 0; i < this.depth; i++) {
                this.writer.write("  ");
            }
        }
        let esp = this.depth * 3;
        let prefix = namespace === null ? "" : this.getPrefix(namespace, true, true);
        if ("" === namespace) {
            for (let i = this.nspCounts[this.depth]; i < this.nspCounts[this.depth + 1]; i++) {
                if ("" === this.nspStack[i * 2] && "" !== this.nspStack[i * 2 + 1]) {
                    throw new ReferenceError("IllegalStateException Cannot set default namespace for elements in no namespace");
                }
            }
        }
        this.elementStack[esp++] = namespace;
        this.elementStack[esp++] = prefix;
        this.elementStack[esp] = name;
        this.writer.write('<');
        if ("" !== prefix && this.writeEmptyPrefix) {
            this.writer.write(prefix);
            this.writer.write(':');
        }
        this.writer.write(name);
        this.pending = true;
        return this;
    }

    text(txt, start, len=null) {
        if (start !== null && len !== null) {
            let s = '';
            let buf = txt.slice(start, start + len);
            for (let i = 0; i < buf.length; i++) {
                s += String.fromCharCode(buf[i]);
            }
            this.text(s);
        } else {
            this.check(false);
            this.indent[this.depth] = false;
            this.writeEscaped(txt, -1);
        }
        return this;
    }

    writeEscaped(s, quot=-1) {
        let c = null;
        for (let i = 0; i < s.length; i++) {
            c = s.charCodeAt(i);
            switch (c) {
                case char.NEWLINE:
                case char.CARRIAGE_RETURN:
                case char.TAB:
                    if (quot === -1) {
                        this.writer.write(String.fromCharCode(c));
                    } else {
                        this.writer.write("&#" + c + ';');
                    }
                    break;
                case char.AMPERSAND:
                    this.writer.write("&amp;");
                    break;
                case char.RIGHT_ANGLE:
                    this.writer.write("&gt;");
                    break;
                case char.LEFT_ANGLE:
                    this.writer.write("&lt;");
                    break;
                case char.DOUBLE_QUOTE:
                case char.SINGLE_QUOTE:
                    if (c === quot) {
                        this.writer.write(c === char.DOUBLE_QUOTE ? "&quot;" : "&apos;");
                        break;
                    }
                default :
                    if (c >= char.SPACE && c !== char.AT && (c < 127 || this.unicode)) {
                        this.writer.write(String.fromCharCode(c));
                    } else {
                        this.writer.write("&#" + c + ";");
                    }
            }
        }
    }
}

XmlPullParserFactory.addParser(KXmlParser);
XmlPullParserFactory.addSerializer(KXmlSerializer);