for i in `ls *.sh`; do
	echo $i
	if  grep -q "python" $i ; then 
		echo "not concerned"
	else
		if grep -q "/bin/bash" $i ; then
	shfmt $i > temp.sh
	mv temp.sh $i
	chmod 755 $i
		fi
fi
done
