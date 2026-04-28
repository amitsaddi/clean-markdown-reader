declare module 'markdown-it-katex' {
    import MarkdownIt from 'markdown-it';
    const mkdnKatex: MarkdownIt.PluginSimple | MarkdownIt.PluginWithOptions;
    export default mkdnKatex;
}
