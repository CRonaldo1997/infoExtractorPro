from typing import List, Optional
from langchain_text_splitters import RecursiveCharacterTextSplitter

class TextSplitter:
    def __init__(
        self, 
        chunk_size: int = 2000, 
        chunk_overlap: int = 200,
        separators: Optional[List[str]] = None
    ):
        # 默认分隔符支持中英文语义边界
        default_separators = ["\n\n", "\n", "。", ".", " ", ""]
        self.separators = separators or default_separators
        
        self.splitter = RecursiveCharacterTextSplitter(
            separators=self.separators,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=len,
            add_start_index=True
        )

    def split_text(self, text: str) -> List[str]:
        if not text:
            return []
        
        # 内部使用 split_text 返回字符串列表
        return self.splitter.split_text(text)

def get_text_splitter(
    chunk_size: int, 
    chunk_overlap: int, 
    separators: Optional[List[str]] = None
) -> TextSplitter:
    return TextSplitter(
        chunk_size=chunk_size, 
        chunk_overlap=chunk_overlap, 
        separators=separators
    )
