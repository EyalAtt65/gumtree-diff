"""
This is a docstring
"""

import math

class ClassA:
    def __init__(self, count: int = 100, factor: float = 3.0) -> None:
        # Some comment
        self.max: int = count
        self.factor: float = factor
    
    def _calculate(self, a: float):
        x = self.max / self.factor + math.sqrt(a)
        return x ** 2
    
    def run(self, times: int):
        value = 0
        for i in range(times):
            value = self._calculate(5)
        
        return value

        