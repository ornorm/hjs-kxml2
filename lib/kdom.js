/** @babel */
import {START_TAG, END_TAG, START_DOCUMENT, END_DOCUMENT, TEXT, CDSECT, ENTITY_REF, IGNORABLE_WHITESPACE, PROCESSING_INSTRUCTION, COMMENT, DOCDECL} from "hjs-xmlpull/lib/v1";

export const DOCUMENT = 0;
export const ELEMENT = 2;

export class KNode {

    constructor() {
        this.children = null;
        this.prefixes = null;
        this.parent = null;
        this.types = null;
    }

    addChild(type, child, index = -1) {
        if (child === null) {
            throw new ReferenceError("NullPointerException");
        }
        if (index > -1) {
            if (this.children === null) {
                this.children = [];
                this.types = [];
            }
            if (type === ELEMENT) {
                if (!(child instanceof KElement)) {
                    throw new TypeError("RuntimeException Element obj expected)");
                }
                child.setParent(this);
            } else if (typeof child !== 'string') {
                throw new TypeError("RuntimeException String expected");
            }
            this.children.splice(index, 0, child);
            this.types.splice(index, 0, type);
        } else {
            this.addChild(type, child, this.getChildCount());
        }
    }

    createElement(namespace, name) {
        let e = new KElement();
        e.namespace = namespace === null ? "" : namespace;
        e.name = name;
        return e;
    }

    getChild(index) {
        return this.children[index];
    }

    getChildCount() {
        return this.children === null ? 0 : this.children.length;
    }

    getElement(value, name) {
        if (typeof value === 'number') {
            let child = this.getChild(value);
            return (child instanceof KElement) ? child : null;
        }
        let namespace = value;
        let i = this.indexOf(namespace, name, 0);
        let j = this.indexOf(namespace, name, i + 1);
        if (i === -1 || j != -1) {
            throw new ReferenceError("RuntimeException KElement {" + namespace + "}" + name + (i === -1 ? " not" +
                    " found in " : " more than once in ") + this);
        }
        return this.getElement(i);
    }

    getText(index) {
        return (this.isText(index)) ? this.getChild(index) : null;
    }

    getType(index) {
        return this.types[index];
    }

    indexOf(namespace, name, startIndex) {
        let len = this.getChildCount();
        for (let i = startIndex; i < len; i++) {
            let child = this.getElement(i);
            if (child !== null && name === child.getName() &&
                (namespace === null || namespace === child.getNamespace())) {
                return i;
            }
        }
        return -1;
    }

    isText(i) {
        let t = this.getType(i);
        return t === TEXT || t === IGNORABLE_WHITESPACE || t === CDSECT;
    }

    parse(parser) {
        let leave = false;
        do {
            let type = parser.getEventType();
            switch (type) {
                case START_TAG :
                    let child = this.createElement(parser.getNamespace(), parser.getName());
                    this.addChild(ELEMENT, child);
                    child.parse(parser);
                    break;
                case END_DOCUMENT :
                case END_TAG :
                    leave = true;
                    break;
                default :
                    if (parser.getText() !== null) {
                        this.addChild(type === ENTITY_REF ? TEXT : type, parser.getText());
                    } else if (type === ENTITY_REF && parser.getName() !== null) {
                        this.addChild(ENTITY_REF, parser.getName());
                    }
                    parser.nextToken();
                    break;
            }
        } while (!leave);
    }

    removeChild(idx) {
        this.children.splice(idx, 1);
        this.types.splice(idx, 1);
    }

    write(writer) {
        this.writeChildren(writer);
        writer.flush();
    }

    writeChildren(writer) {
        if (this.children === null) {
            return;
        }
        let len = this.children.length;
        for (let i = 0; i < len; i++) {
            let type = this.getType(i);
            let child = this.children[i];
            switch (type) {
                case ELEMENT :
                    child.write(writer);
                    break;
                case TEXT :
                    writer.text(child);
                    break;
                case IGNORABLE_WHITESPACE :
                    writer.ignorableWhitespace(child);
                    break;
                case CDSECT :
                    writer.cdsect(child);
                    break;
                case COMMENT :
                    writer.comment(child);
                    break;
                case ENTITY_REF :
                    writer.entityRef(child);
                    break;
                case PROCESSING_INSTRUCTION :
                    writer.processingInstruction(child);
                    break;
                case DOCDECL :
                    writer.docdecl(child);
                    break;
                default :
                    throw new SyntaxError("Illegal type: " + type);
            }
        }
    }
}

export class KElement extends KNode {

    constructor() {
        super();
        this.name = null;
        this.prefixes = null;
        this.children = null;
        this.namespace = null;
        this.attributes = null;
    }

    clear() {
        this.attributes = null;
        this.children = null;
    }

    createElement(namespace, name) {
        return this.parent !== null ?
            super.createElement(namespace, name) : this.parent.createElement(namespace, name);
    }

    getAttributeCount() {
        return this.attributes === null ? 0 : this.attributes.length;
    }

    getAttributeName(index) {
        return this.attributes[index][1];
    }

    getAttributeNamespace(index) {
        return this.attributes[index][0];
    }

    getAttributeValue(namespace, name) {
        if (!(typeof namespace === 'number')) {
            for (let i = 0; i < this.getAttributeCount(); i++) {
                if (name === this.getAttributeName(i) &&
                    (namespace === null || namespace === this.getAttributeNamespace(i))) {
                    return this.getAttributeValue(i);
                }
            }
            return null;
        }
        return this.attributes[namespace][2];
    }

    getName() {
        return this.name;
    }

    getNamespace() {
        return this.namespace;
    }

    getNamespaceCount() {
        return this.prefixes === null ? 0 : this.prefixes.length;
    }

    getNamespacePrefix(i) {
        return this.prefixes[i][0];
    }

    getNamespaceUri(prefix) {
        if (!isNaN(prefix)) {
            return this.prefixes[i][1];
        }
        let cnt = this.getNamespaceCount();
        for (let i = 0; i < cnt; i++) {
            if (prefix === this.getNamespacePrefix(i) ||
                (prefix === null && prefix === this.getNamespacePrefix(i))) {
                return this.getNamespaceUri(i);
            }
        }
        return this.parent instanceof KElement ? this.parent.getNamespaceUri(prefix) : null;
    }

    getParent() {
        return this.parent;
    }

    getRoot() {
        let current = this;
        while (current.parent !== null) {
            if (!(current.parent instanceof KElement)) {
                return current.parent;
            }
            current = current.parent;
        }
        return current;
    }

    init() {

    }

    parse(parser) {
        for (let i = parser.getNamespaceCount(parser.getDepth() - 1);
             i < parser.getNamespaceCount(parser.getDepth()); i++) {
            this.setPrefix(
                parser.getNamespacePrefix(i),
                parser.getNamespaceUri(i));
        }
        for (let i = 0; i < parser.getAttributeCount(); i++) {
            this.setAttribute(
                parser.getAttributeNamespace(i),
                parser.getAttributeName(i),
                parser.getAttributeValue(i));
        }
        this.init();
        if (parser.isEmptyElementTag()) {
            parser.nextToken();
        } else {
            parser.nextToken();
            super.parse(parser);
            if (this.getChildCount() === 0) {
                this.addChild(IGNORABLE_WHITESPACE, "");
            }
        }
        parser.require(END_TAG, this.getNamespace(), this.getName());
        parser.nextToken();
    }

    setAttribute(namespace, name, value) {
        if (this.attributes === null) {
            this.attributes = [];
        }
        if (namespace === null) {
            namespace = "";
        }
        for (let i = this.attributes.length - 1; i >= 0; i--) {
            let attribut = this.attributes[i];
            if (attribut[0] === namespace && attribut[1] === name) {
                if (value === null) {
                    this.attributes.splice(i, 1);
                } else {
                    attribut[2] = value;
                }
                return;
            }
        }
        this.attributes.push([namespace, name, value]);
    }

    setName(name) {
        this.name = name;
    }

    setNamespace(namespace) {
        if (this.namespace === null) {
            throw new ReferenceError("NullPointerException Use \"\" for empty namespace");
        }
        this.namespace = namespace;
    }

    setParent(parent) {
        this.parent = parent;
    }

    setPrefix(prefix, namespace) {
        if (this.prefixes === null) {
            this.prefixes = [];
        }
        this.prefixes.push([prefix, namespace]);
    }

    write(writer) {
        if (this.prefixes !== null) {
            for (let i = 0; i < this.prefixes.length; i++) {
                writer.setPrefix(this.getNamespacePrefix(i), this.getNamespaceUri(i));
            }
        }
        writer.startTag(this.getNamespace(), this.getName());
        let len = this.getAttributeCount();
        for (let i = 0; i < len; i++) {
            writer.attribute(this.getAttributeNamespace(i), this.getAttributeName(i), this.getAttributeValue(i));
        }
        this.writeChildren(writer);
        writer.endTag(this.getNamespace(), this.getName());
    }
}

export class KDocument extends KNode {

    constructor() {
        super();
    }

    addChild(type, child, index) {
        if (type === ELEMENT) {
            this.rootIndex = index;
        } else if (this.rootIndex >= index) {
            this.rootIndex++;
        }
        super.addChild(type, child, index);
    }

    static findDuplicatesNodes(node) {
        let childCount = node.getChildCount();
        let names = [];
        for (let i=0; i<childCount; i++) {
            if (!node.isText(i) && node.getType(i) === ELEMENT) {
                let child = node.getChild(i);
                let name = child.getName();
                names.push(name);
            }
        }
        let uniq = names.map((name) => { return { count: 1, name: name }; })
            .reduce((a, b) => {
                a[b.name] = (a[b.name] || 0) + b.count;
                return a;
            }, {});
        return Object.keys(uniq).filter((a) => uniq[a] > 1);
    }

    getEncoding() {
        return this.encoding;
    }

    getName() {
        return "#document";
    }

    getRootElement() {
        if (this.rootIndex === -1) {
            throw new ReferenceError("RuntimeException Document has no root element!");
        }
        return this.getChild(this.rootIndex);
    }

    getStandalone() {
        return this.standalone;
    }

    parse(parser) {
        parser.require(START_DOCUMENT, null, null);
        parser.nextToken();
        this.encoding = parser.getInputEncoding();
        this.standalone = parser.getProperty("http://xmlpull.org/v1/doc/properties.html#xmldecl-standalone");
        super.parse(parser);
        if (parser.getEventType() !== END_DOCUMENT) {
            throw new SyntaxError("RuntimeException Document end expected!");
        }
    }

    static readAttributesToJSON(node, context) {
        let attributeCount = node.getAttributeCount();
        while(attributeCount--) {
            let k = node.getAttributeName(attributeCount);
            context[k] = node.getAttributeValue(null, k);
        }
    }

    static readNodesToJSON(node, context, flags=0, codec = null) {
        let duplicates = KDocument.findDuplicatesNodes(node);
        let childCount = node.getChildCount();
        for (let i=0; i<childCount; i++) {
            let type = node.getType(i);
            switch(type) {
                case CDSECT:
                    if (((flags & CDSECT) !== 0) &&
                        codec !== null) {
                        context["#cdata"] = codec.encode(node.getText(i));
                    }
                    break;
                case COMMENT:
                    if (((flags & COMMENT) !== 0) && codec !== null) {
                        //context["#comment"] = codec.encode(node.getText(i));
                    }
                    break;
                case TEXT:
                    if (((flags & TEXT) !== 0) && codec !== null) {
                        //console.log(typeof node.getText(i));
                        //context["#text"] = codec.encode(node.getText(i));
                    }
                    break;
                case ELEMENT:
                    let child = node.getChild(i);
                    let name = child.getName();
                    let element = {};
                    KDocument.readAttributesToJSON(child, element);
                    KDocument.readNodesToJSON(child, element, flags, codec);
                    if (duplicates.indexOf(name) !== -1) {
                        if (!context[name]) {
                            context[name] = [];
                        }
                        context[name].push(element);
                    } else {
                        context[name] = element;
                    }
                    break;
                case DOCDECL:
                case DOCUMENT:
                case ENTITY_REF:
                case IGNORABLE_WHITESPACE:
                case PROCESSING_INSTRUCTION:
                    break;
            }
        }
    }

    removeChild(index) {
        if (index === this.rootIndex) {
            this.rootIndex = -1;
        } else if (index < this.rootIndex) {
            this.rootIndex--;
        }
        super.removeChild(index);
    }

    setEncoding(enc) {
        this.encoding = enc;
    }

    setStandalone(standalone) {
        this.standalone = standalone;
    }

    static toJSON({ doc, context, flags=0, codec=null }={}) {
       let root = doc.getRootElement();
       KDocument.readAttributesToJSON(root, context);
       KDocument.readNodesToJSON(root, context, flags, codec);
       return context;
    }
}