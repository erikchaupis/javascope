package com.example;

import java.util.List;
import java.util.ArrayList;

public class HelloUnformatted{private List<String> names=new ArrayList<>();
public static void main(String[]args){if(args.length>0){for(String a:args){System.out.println(a);}}else{System.out.println("no args");}}}
