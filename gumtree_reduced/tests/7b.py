"""
Docstring
"""

import math

def foo(x):
    if ("1" == x):
        for i in range(5):
            y = x + 1
            x = math.sqrt(x / 2.0)
    if (x < 7):
        print("success")
        x += 1

    return x

