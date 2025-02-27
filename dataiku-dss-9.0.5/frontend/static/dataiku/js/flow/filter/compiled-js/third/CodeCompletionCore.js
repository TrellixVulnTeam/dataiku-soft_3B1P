'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeCompletionCore = exports.CandidatesCollection = void 0;
const antlr4ts_1 = require("antlr4ts");
const atn_1 = require("antlr4ts/atn");
const misc_1 = require("antlr4ts/misc");
class CandidatesCollection {
    constructor() {
        this.tokens = new Map();
        this.rules = new Map();
    }
}
exports.CandidatesCollection = CandidatesCollection;
class FollowSetWithPath {
    constructor() {
        this.path = [];
        this.following = [];
    }
}
class FollowSetsHolder {
}
class PipelineEntry {
}
class CodeCompletionCore {
    constructor(parser) {
        this.showResult = false;
        this.showDebugOutput = false;
        this.debugOutputWithTransitions = false;
        this.showRuleStack = false;
        this.tokenStartIndex = 0;
        this.statesProcessed = 0;
        this.shortcutMap = new Map();
        this.candidates = new CandidatesCollection();
        this.atnStateTypeMap = [
            "invalid",
            "basic",
            "rule start",
            "block start",
            "plus block start",
            "star block start",
            "token start",
            "rule stop",
            "block end",
            "star loop back",
            "star loop entry",
            "plus loop back",
            "loop end"
        ];
        this.parser = parser;
        this.atn = parser.atn;
        this.vocabulary = parser.vocabulary;
        this.ruleNames = parser.ruleNames;
        this.ignoredTokens = new Set();
        this.preferredRules = new Set();
    }
    collectCandidates(caretTokenIndex, context) {
        this.shortcutMap.clear();
        this.candidates.rules.clear();
        this.candidates.tokens.clear();
        this.statesProcessed = 0;
        this.tokenStartIndex = context ? context.start.tokenIndex : 0;
        let tokenStream = this.parser.inputStream;
        let currentIndex = tokenStream.index;
        tokenStream.seek(this.tokenStartIndex);
        this.tokens = [];
        let offset = 1;
        while (true) {
            let token = tokenStream.LT(offset++);
            this.tokens.push(token.type);
            if (token.tokenIndex >= caretTokenIndex || token.type == antlr4ts_1.Token.EOF)
                break;
        }
        tokenStream.seek(currentIndex);
        let callStack = [];
        let startRule = context ? context.ruleIndex : 0;
        this.processRule(this.atn.ruleToStartState[startRule], 0, callStack, "");
        if (this.showResult)
            console.log("States processed: " + this.statesProcessed);
        if (this.showResult) {
            console.log("\n\nCollected rules:\n");
            for (let rule of this.candidates.rules) {
                let path = "";
                for (let token of rule[1]) {
                    path += this.ruleNames[token] + " ";
                }
                console.log(this.ruleNames[rule[0]] + ", path: ", path);
            }
            let sortedTokens = new Set();
            for (let token of this.candidates.tokens) {
                let value = this.vocabulary.getDisplayName(token[0]);
                for (let following of token[1])
                    value += " " + this.vocabulary.getDisplayName(following);
                sortedTokens.add(value);
            }
            console.log("\n\nCollected tokens:\n");
            for (let symbol of sortedTokens) {
                console.log(symbol);
            }
            console.log("\n\n");
        }
        return this.candidates;
    }
    checkPredicate(transition) {
        return transition.predicate.eval(this.parser, antlr4ts_1.ParserRuleContext.emptyContext());
    }
    translateToRuleIndex(ruleStack) {
        if (this.preferredRules.size == 0)
            return false;
        for (let i = 0; i < ruleStack.length; ++i) {
            if (this.preferredRules.has(ruleStack[i])) {
                let path = ruleStack.slice(0, i);
                let addNew = true;
                for (let rule of this.candidates.rules) {
                    if (rule[0] != ruleStack[i] || rule[1].length != path.length)
                        continue;
                    if (path.every((v, j) => v === rule[1][j])) {
                        addNew = false;
                        break;
                    }
                }
                if (addNew) {
                    this.candidates.rules.set(ruleStack[i], path);
                    if (this.showDebugOutput)
                        console.log("=====> collected: ", this.ruleNames[i]);
                }
                return true;
            }
        }
        return false;
    }
    getFollowingTokens(transition) {
        let result = [];
        let pipeline = [transition.target];
        while (pipeline.length > 0) {
            let state = pipeline.pop();
            for (let transition of state.getTransitions()) {
                if (transition.serializationType == 5) {
                    if (!transition.isEpsilon) {
                        let list = transition.label.toList();
                        if (list.length == 1 && !this.ignoredTokens.has(list[0])) {
                            result.push(list[0]);
                            pipeline.push(transition.target);
                        }
                    }
                    else {
                        pipeline.push(transition.target);
                    }
                }
            }
        }
        return result;
    }
    determineFollowSets(start, stop) {
        let result = [];
        let seen = new Set();
        let ruleStack = [];
        this.collectFollowSets(start, stop, result, seen, ruleStack);
        return result;
    }
    collectFollowSets(s, stopState, followSets, seen, ruleStack) {
        if (seen.has(s))
            return;
        seen.add(s);
        if (s == stopState || s.stateType == 7) {
            let set = new FollowSetWithPath();
            set.intervals = misc_1.IntervalSet.of(antlr4ts_1.Token.EPSILON);
            set.path = ruleStack.slice();
            followSets.push(set);
            return;
        }
        for (let transition of s.getTransitions()) {
            if (transition.serializationType == 3) {
                let ruleTransition = transition;
                if (ruleStack.indexOf(ruleTransition.target.ruleIndex) != -1)
                    continue;
                ruleStack.push(ruleTransition.target.ruleIndex);
                this.collectFollowSets(transition.target, stopState, followSets, seen, ruleStack);
                ruleStack.pop();
            }
            else if (transition.serializationType == 4) {
                if (this.checkPredicate(transition))
                    this.collectFollowSets(transition.target, stopState, followSets, seen, ruleStack);
            }
            else if (transition.isEpsilon) {
                this.collectFollowSets(transition.target, stopState, followSets, seen, ruleStack);
            }
            else if (transition.serializationType == 9) {
                let set = new FollowSetWithPath();
                set.intervals = misc_1.IntervalSet.of(antlr4ts_1.Token.MIN_USER_TOKEN_TYPE, this.atn.maxTokenType);
                set.path = ruleStack.slice();
                followSets.push(set);
            }
            else {
                let label = transition.label;
                if (label && label.size > 0) {
                    if (transition.serializationType == 8) {
                        label = label.complement(misc_1.IntervalSet.of(antlr4ts_1.Token.MIN_USER_TOKEN_TYPE, this.atn.maxTokenType));
                    }
                    let set = new FollowSetWithPath();
                    set.intervals = label;
                    set.path = ruleStack.slice();
                    set.following = this.getFollowingTokens(transition);
                    followSets.push(set);
                }
            }
        }
    }
    processRule(startState, tokenIndex, callStack, indentation) {
        let positionMap = this.shortcutMap.get(startState.ruleIndex);
        if (!positionMap) {
            positionMap = new Map();
            this.shortcutMap.set(startState.ruleIndex, positionMap);
        }
        else {
            if (positionMap.has(tokenIndex)) {
                if (this.showDebugOutput) {
                    console.log("=====> shortcut");
                }
                return positionMap.get(tokenIndex);
            }
        }
        let result = new Set();
        let setsPerState = CodeCompletionCore.followSetsByATN.get(this.parser.constructor.name);
        if (!setsPerState) {
            setsPerState = new Map();
            CodeCompletionCore.followSetsByATN.set(this.parser.constructor.name, setsPerState);
        }
        let followSets = setsPerState.get(startState.stateNumber);
        if (!followSets) {
            followSets = new FollowSetsHolder();
            setsPerState.set(startState.stateNumber, followSets);
            let stop = this.atn.ruleToStopState[startState.ruleIndex];
            followSets.sets = this.determineFollowSets(startState, stop);
            let combined = new misc_1.IntervalSet();
            for (let set of followSets.sets)
                combined.addAll(set.intervals);
            followSets.combined = combined;
        }
        callStack.push(startState.ruleIndex);
        let currentSymbol = this.tokens[tokenIndex];
        if (tokenIndex >= this.tokens.length - 1) {
            if (this.preferredRules.has(startState.ruleIndex)) {
                this.translateToRuleIndex(callStack);
            }
            else {
                for (let set of followSets.sets) {
                    let fullPath = callStack.slice();
                    fullPath.push(...set.path);
                    if (!this.translateToRuleIndex(fullPath)) {
                        for (let symbol of set.intervals.toList())
                            if (!this.ignoredTokens.has(symbol)) {
                                if (this.showDebugOutput) {
                                    console.log("=====> collected: ", this.vocabulary.getDisplayName(symbol));
                                }
                                if (!this.candidates.tokens.has(symbol))
                                    this.candidates.tokens.set(symbol, set.following);
                                else {
                                    if (this.candidates.tokens.get(symbol) != set.following)
                                        this.candidates.tokens.set(symbol, []);
                                }
                            }
                    }
                }
            }
            callStack.pop();
            return result;
        }
        else {
            if (!followSets.combined.contains(antlr4ts_1.Token.EPSILON) && !followSets.combined.contains(currentSymbol)) {
                callStack.pop();
                return result;
            }
        }
        let statePipeline = [];
        let currentEntry;
        statePipeline.push({ state: startState, tokenIndex: tokenIndex });
        while (statePipeline.length > 0) {
            currentEntry = statePipeline.pop();
            ++this.statesProcessed;
            currentSymbol = this.tokens[currentEntry.tokenIndex];
            let atCaret = currentEntry.tokenIndex >= this.tokens.length - 1;
            if (this.showDebugOutput) {
                this.printDescription(indentation, currentEntry.state, this.generateBaseDescription(currentEntry.state), currentEntry.tokenIndex);
                if (this.showRuleStack)
                    this.printRuleState(callStack);
            }
            switch (currentEntry.state.stateType) {
                case 2:
                    indentation += "  ";
                    break;
                case 7: {
                    result.add(currentEntry.tokenIndex);
                    continue;
                }
                default:
                    break;
            }
            let transitions = currentEntry.state.getTransitions();
            for (let transition of transitions) {
                switch (transition.serializationType) {
                    case 3: {
                        let endStatus = this.processRule(transition.target, currentEntry.tokenIndex, callStack, indentation);
                        for (let position of endStatus) {
                            statePipeline.push({ state: transition.followState, tokenIndex: position });
                        }
                        break;
                    }
                    case 4: {
                        if (this.checkPredicate(transition))
                            statePipeline.push({ state: transition.target, tokenIndex: currentEntry.tokenIndex });
                        break;
                    }
                    case 9: {
                        if (atCaret) {
                            if (!this.translateToRuleIndex(callStack)) {
                                for (let token of misc_1.IntervalSet.of(antlr4ts_1.Token.MIN_USER_TOKEN_TYPE, this.atn.maxTokenType).toList())
                                    if (!this.ignoredTokens.has(token))
                                        this.candidates.tokens.set(token, []);
                            }
                        }
                        else {
                            statePipeline.push({ state: transition.target, tokenIndex: currentEntry.tokenIndex + 1 });
                        }
                        break;
                    }
                    default: {
                        if (transition.isEpsilon) {
                            statePipeline.push({ state: transition.target, tokenIndex: currentEntry.tokenIndex });
                            continue;
                        }
                        let set = transition.label;
                        if (set && set.size > 0) {
                            if (transition.serializationType == 8) {
                                set = set.complement(misc_1.IntervalSet.of(antlr4ts_1.Token.MIN_USER_TOKEN_TYPE, this.atn.maxTokenType));
                            }
                            if (atCaret) {
                                if (!this.translateToRuleIndex(callStack)) {
                                    let list = set.toList();
                                    let addFollowing = list.length == 1;
                                    for (let symbol of list)
                                        if (!this.ignoredTokens.has(symbol)) {
                                            if (this.showDebugOutput)
                                                console.log("=====> collected: ", this.vocabulary.getDisplayName(symbol));
                                            if (addFollowing)
                                                this.candidates.tokens.set(symbol, this.getFollowingTokens(transition));
                                            else
                                                this.candidates.tokens.set(symbol, []);
                                        }
                                }
                            }
                            else {
                                if (set.contains(currentSymbol)) {
                                    if (this.showDebugOutput)
                                        console.log("=====> consumed: ", this.vocabulary.getDisplayName(currentSymbol));
                                    statePipeline.push({ state: transition.target, tokenIndex: currentEntry.tokenIndex + 1 });
                                }
                            }
                        }
                    }
                }
            }
        }
        callStack.pop();
        positionMap.set(tokenIndex, result);
        return result;
    }
    generateBaseDescription(state) {
        let stateValue = state.stateNumber == atn_1.ATNState.INVALID_STATE_NUMBER ? "Invalid" : state.stateNumber;
        return "[" + stateValue + " " + this.atnStateTypeMap[state.stateType] + "] in " + this.ruleNames[state.ruleIndex];
    }
    printDescription(currentIndent, state, baseDescription, tokenIndex) {
        let output = currentIndent;
        let transitionDescription = "";
        if (this.debugOutputWithTransitions) {
            for (let transition of state.getTransitions()) {
                let labels = "";
                let symbols = transition.label ? transition.label.toList() : [];
                if (symbols.length > 2) {
                    labels = this.vocabulary.getDisplayName(symbols[0]) + " .. " + this.vocabulary.getDisplayName(symbols[symbols.length - 1]);
                }
                else {
                    for (let symbol of symbols) {
                        if (labels.length > 0)
                            labels += ", ";
                        labels += this.vocabulary.getDisplayName(symbol);
                    }
                }
                if (labels.length == 0)
                    labels = "ε";
                transitionDescription += "\n" + currentIndent + "\t(" + labels + ") " + "[" + transition.target.stateNumber + " " +
                    this.atnStateTypeMap[transition.target.stateType] + "] in " + this.ruleNames[transition.target.ruleIndex];
            }
        }
        if (tokenIndex >= this.tokens.length - 1)
            output += "<<" + this.tokenStartIndex + tokenIndex + ">> ";
        else
            output += "<" + this.tokenStartIndex + tokenIndex + "> ";
        console.log(output + "Current state: " + baseDescription + transitionDescription);
    }
    printRuleState(stack) {
        if (stack.length == 0) {
            console.log("<empty stack>");
            return;
        }
        for (let rule of stack)
            console.log(this.ruleNames[rule]);
    }
}
exports.CodeCompletionCore = CodeCompletionCore;
CodeCompletionCore.followSetsByATN = new Map();
//# sourceMappingURL=CodeCompletionCore.js.map