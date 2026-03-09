#!/bin/bash
# Usage: ./fetch-page.sh "https://url.com"
# Returns: clean markdown text
URL="${1:?Usage: fetch-page.sh <url>}"
curl -sL "$URL" \
  | python3 -c "
import sys
from html.parser import HTMLParser
class MLStripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self.fed = []
        self.skip = False
    def handle_starttag(self, tag, attrs):
        if tag in ('script','style','nav','footer'):
            self.skip = True
    def handle_endtag(self, tag):
        if tag in ('script','style','nav','footer'):
            self.skip = False
    def handle_data(self, d):
        if not self.skip and d.strip():
            self.fed.append(d.strip())
s = MLStripper()
s.feed(sys.stdin.read())
print('\n'.join(s.fed[:200]))  # max 200 lines
" 2>/dev/null | head -c 8000
