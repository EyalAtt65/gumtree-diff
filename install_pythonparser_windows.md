## Install pythonparser
```git clone https://github.com/GumTreeDiff/pythonparser.git```

```pip install -r requirements.txt```

## Install py2exe

```pip install py2exe```

## Some hacks before running py2exe
pythonparser uses parso package. Parso uses some txt files we need, but when it's compiled with py2exe for some reason these txt files are not copied.
To overcome, do the following:

Go to ```C:\Users\<user>\AppData\Local\Programs\Python\<python_ver>\Lib\site-packages\parso```

(you can find this path by running ```pip list -v```, and see where the parso package is located)

And edit **grammar.py**:

![image](https://user-images.githubusercontent.com/58233425/221403235-600878a0-aca6-4c6b-8457-b36889169bc6.png)

(input the path to pythonparser)

Now create a dir called **python**, and copy all grammar*.txt files from **parso/python** into it:
![image](https://user-images.githubusercontent.com/58233425/221403251-1d273959-173d-477f-ad2d-0c8ecfa48df7.png)


## Run py2exe

Create a file called **setup.py** in the pythonparser dir, with the following contents:
```py
from distutils.core import setup
import py2exe

setup(console=['pythonparser.py'])
```

And run ```python setup.py py2exe```

Now pythonparser.exe is installed in pythonparser\dist!

## Direct gumtree to our pythonparser.exe
Finally, go to **gen.python/src/main/java/com/github/gumtreediff/gen/python/PythonTreeGenerator.java** and edit the path to pythonparser.exe:

![image](https://user-images.githubusercontent.com/58233425/221403545-403f2f88-ccf9-45eb-9a27-8c6fd0fc7892.png)


