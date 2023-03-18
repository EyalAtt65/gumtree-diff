#!/usr/bin/env python3

MAX_VALUE = 100

def foo(number):
    counter = 0
    for i in range(number):
        counter += 1
        x = counter * 2
        print(x)

        if (x > MAX_VALUE):
            y = MAX_VALUE
        else:
            y = x

        print(y)
