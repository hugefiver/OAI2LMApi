import { LanguageModelResponsePart as _LanguageModelResponsePart} from "vscode";

declare module 'vscode' {
    export type ExLanguageModelResponsePart = _LanguageModelResponsePart | LanguageModelThinkingPart;
}