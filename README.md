## Tag & Word Cloud

Plugin for [Obsidian](https://obsidian.md)

![GitHub package.json version](https://img.shields.io/github/package-json/v/joethei/obsidian-tagcloud)
![GitHub manifest.json dynamic (path)](https://img.shields.io/github/manifest-json/minAppVersion/joethei/obsidian-tagcloud?label=lowest%20supported%20app%20version)
![GitHub](https://img.shields.io/github/license/joethei/obsidian-tagcloud)
[![libera manifesto](https://img.shields.io/badge/libera-manifesto-lightgrey.svg)](https://liberamanifesto.com)
---

![](https://i.joethei.space/Obsidian_XQP86CLUkB.png)


With this plugin you can create a tag or word cloud in your notes.

To do this create a codeblock named either `tagcloud` or `wordcloud`.
A tagcloud displays all tags in your vault,
the wordcloud displays all words in the note the codeblock has been created in.


The following options are supported:

| **Name**   | **Description**                                 | **Possible Values**                                                           | **Default**                            |
|------------|-------------------------------------------------|-------------------------------------------------------------------------------|----------------------------------------|
| shape      | What shape to draw                              | circle, cardioid, diamond, square, triangle-forward, triange, pentagon, star  | circle                                 |
| weight     | factor by wich the size of a word is multiplied | number                                                                        | 2                                      |
| background | Background color                                | a hexadecimal RGB value                                                       | background color from the chosen theme |
| width      | Width of canvas                                 | any valid [CSS unit](https://developer.mozilla.org/en-US/docs/Web/CSS/length) | line width                             |
| height     | Height of canvas                                | any valid [CSS unit](https://developer.mozilla.org/en-US/docs/Web/CSS/length) | width / 2                              |
