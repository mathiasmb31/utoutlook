for i in `ls *.sh`; do
	shfmt $i > temp.h
	mv temp.sh $i
done
