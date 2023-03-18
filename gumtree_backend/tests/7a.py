"""
Docstring
"""

import math

MIN_VALUE = 10.0

def foo(x):
    if (x > MIN_VALUE):
        for i in range(5):
            x = math.sqrt(x / 2.0)
            y = x + 1
    if (x < 7):
        print("success")
        x += 1
        
    return x

