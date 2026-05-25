"""领域层错误。"""


class VersionConflictError(Exception):
    """当客户端基于旧版本图进行写入时抛出。"""

    def __init__(self, expected: int, actual: int):
        super().__init__(f"version conflict: expected {expected}, actual {actual}")
        self.expected = expected
        self.actual = actual
